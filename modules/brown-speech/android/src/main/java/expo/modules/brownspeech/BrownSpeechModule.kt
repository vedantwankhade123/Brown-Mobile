package expo.modules.brownspeech

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Build
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

/**
 * Native Android dictation through the system SpeechRecognizer.
 *
 * The recognizer ends after every utterance, so continuous mode restarts it and keeps
 * appending to one transcript until the user taps stop or the session cap is reached.
 * Without that restart a single pause would silently cut the sentence in half.
 */
class BrownSpeechModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var pendingRestart: Runnable? = null
  private var stopDeadline: Runnable? = null
  private var sessionDeadline: Runnable? = null
  private var generation = 0
  private var partial = ""
  private var retries = 0

  @Volatile
  private var active = false
  private var continuous = true
  private var finishing = false
  private var preferOffline = true
  private var language: String = Locale.getDefault().toLanguageTag()
  private var transcript = StringBuilder()
  private var startedAt = 0L

  private fun listener(token: Int): RecognitionListener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) {}

    override fun onBeginningOfSpeech() {}

    override fun onRmsChanged(rmsdB: Float) {}

    override fun onBufferReceived(buffer: ByteArray?) {}

    override fun onEndOfSpeech() {}

    override fun onPartialResults(results: Bundle?) {
      if (!active || token != generation) return
      val text = bestResult(results)
      if (text.isEmpty()) return
      partial = text
      sendEvent(EVENT_PARTIAL, mapOf("text" to preview(text)))
    }

    override fun onResults(results: Bundle?) {
      if (!active || token != generation) return
      append(bestResult(results).ifEmpty { partial })
      partial = ""
      retries = 0
      if (shouldContinue()) restart() else finishSession()
    }

    override fun onError(error: Int) {
      if (!active || token != generation) return
      // Silence between sentences surfaces as an error, not as a result. While dictating it
      // only means "listen again"; once the user pressed stop it means the tail was quiet.
      val quiet = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
      if (quiet && finishing) {
        append(partial)
        partial = ""
        finishSession()
        return
      }
      if (quiet && shouldContinue()) {
        // Keep an unfinalized hypothesis across a recognizer silence timeout.
        append(partial)
        partial = ""
        restart()
        return
      }
      // Some phones have an offline recognizer but lack this language's pack.
      // Retry once with the system service instead of leaving the microphone stuck.
      if ((error == 12 || error == 13) && preferOffline && !finishing) {
        preferOffline = false
        releaseRecognizer()
        val ctx = appContext.reactContext
        if (ctx != null) {
          try {
            val replacement = SpeechRecognizer.createSpeechRecognizer(ctx)
            recognizer = replacement
            replacement.setRecognitionListener(listener(++generation))
            restart()
            return
          } catch (@Suppress("unused") e: Exception) {}
        }
      }
      val transient = error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_SERVER || error == 11
      if (transient && !finishing && retries++ < 2 && shouldContinue()) {
        restart(500L * retries)
        return
      }
      errorOut(describe(error), error)
    }

    override fun onEvent(eventType: Int, params: Bundle?) {}
  }

  override fun definition() = ModuleDefinition {
    Name("BrownSpeech")

    Events(EVENT_PARTIAL, EVENT_FINAL, EVENT_ERROR, EVENT_END)

    Function("isSupported") {
      val ctx = appContext.reactContext
      ctx != null && SpeechRecognizer.isRecognitionAvailable(ctx)
    }

    Function("start") { continuousMode: Boolean, offline: Boolean, locale: String ->
      val ctx = appContext.reactContext ?: return@Function false
      continuous = continuousMode
      preferOffline = offline
      if (locale.isNotEmpty()) language = locale
      // SpeechRecognizer must be created and driven from the main thread.
      main.post { beginSession(ctx) }
      true
    }

    /** Commit: stop capturing and deliver everything recognized so far as the final text. */
    Function("stop") {
      main.post {
        if (!active) return@post
        finishing = true
        // Between utterances nothing is listening, so stopListening() would never produce a
        // result. Commit the transcript instead of leaving the caller waiting for a timeout.
        val betweenUtterances = pendingRestart != null
        cancelPendingRestart()
        val current = recognizer
        if (current == null || betweenUtterances) {
          finishSession()
          return@post
        }
        try {
          current.stopListening()
          val deadline = Runnable {
            if (active && finishing) {
              append(partial)
              partial = ""
              finishSession()
            }
          }
          stopDeadline = deadline
          main.postDelayed(deadline, 3500L)
        } catch (@Suppress("unused") e: Exception) {
          finishSession()
        }
      }
    }

    /** Discard: throw the recording away without emitting a final result. */
    Function("cancel") {
      main.post { teardown() }
    }

    OnDestroy {
      main.post { teardown() }
    }
  }

  private fun beginSession(ctx: Context) {
    ++generation
    clearDeadlines()
    cancelPendingRestart()
    releaseRecognizer()
    transcript = StringBuilder()
    partial = ""
    retries = 0
    startedAt = System.currentTimeMillis()
    finishing = false
    active = true

    val created = try {
      if (preferOffline && Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(ctx)) {
        SpeechRecognizer.createOnDeviceSpeechRecognizer(ctx)
      } else SpeechRecognizer.createSpeechRecognizer(ctx)
    } catch (@Suppress("unused") e: Exception) {
      null
    }
    if (created == null) {
      errorOut("This phone has no speech recognition service installed.", ERROR_UNAVAILABLE)
      return
    }
    recognizer = created
    created.setRecognitionListener(listener(generation))
    val deadline = Runnable {
      if (active) {
        finishing = true
        append(partial)
        partial = ""
        finishSession()
      }
    }
    sessionDeadline = deadline
    main.postDelayed(deadline, MAX_SESSION_MS)
    try {
      created.startListening(buildIntent(ctx))
    } catch (@Suppress("unused") e: Exception) {
      errorOut("Speech recognition could not start. Close other recording apps and try again.", ERROR_START_FAILED)
    }
  }

  private fun buildIntent(ctx: Context): Intent {
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
    intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
    intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
    // Some recognizers refuse the request unless the calling package is declared.
    intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.packageName)
    if (preferOffline) {
      intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
    }
    return intent
  }

  private fun shouldContinue(): Boolean =
    continuous && !finishing && active && System.currentTimeMillis() - startedAt < MAX_SESSION_MS

  private fun restart(delay: Long = RESTART_DELAY_MS) {
    val ctx = appContext.reactContext
    val current = recognizer
    if (ctx == null || current == null) {
      finishSession()
      return
    }
    cancelPendingRestart()
    val task = Runnable {
      pendingRestart = null
      if (!active || finishing) return@Runnable
      try {
        current.startListening(buildIntent(ctx))
      } catch (@Suppress("unused") e: Exception) {
        finishSession()
      }
    }
    pendingRestart = task
    main.postDelayed(task, delay)
  }

  private fun append(text: String) {
    if (text.isEmpty()) return
    if (transcript.isNotEmpty() && transcript[transcript.length - 1] != ' ') transcript.append(' ')
    transcript.append(text)
  }

  private fun finishSession() {
    if (!active) return
    append(partial)
    partial = ""
    active = false
    clearDeadlines()
    val text = transcript.toString().trim()
    cancelPendingRestart()
    releaseRecognizer()
    sendEvent(EVENT_FINAL, mapOf("text" to text))
    sendEvent(EVENT_END, mapOf("text" to text))
  }

  private fun errorOut(message: String, code: Int) {
    if (!active) return
    active = false
    clearDeadlines()
    val text = preview(partial).trim()
    cancelPendingRestart()
    releaseRecognizer()
    sendEvent(EVENT_ERROR, mapOf("message" to message, "code" to code, "text" to text))
    sendEvent(EVENT_END, mapOf("text" to text))
  }

  private fun teardown() {
    ++generation
    clearDeadlines()
    val wasActive = active
    active = false
    transcript = StringBuilder()
    partial = ""
    cancelPendingRestart()
    releaseRecognizer()
    if (wasActive) sendEvent(EVENT_END, mapOf("text" to ""))
  }

  private fun clearDeadlines() {
    stopDeadline?.let { main.removeCallbacks(it) }
    sessionDeadline?.let { main.removeCallbacks(it) }
    stopDeadline = null
    sessionDeadline = null
  }

  private fun cancelPendingRestart() {
    val task = pendingRestart
    pendingRestart = null
    if (task != null) main.removeCallbacks(task)
  }

  private fun releaseRecognizer() {
    val current = recognizer
    recognizer = null
    if (current != null) {
      try {
        current.cancel()
      } catch (@Suppress("unused") e: Exception) {
      }
      try {
        current.destroy()
      } catch (@Suppress("unused") e: Exception) {
      }
    }
  }

  /** The recognizer returns several hypotheses; take the most confident one that has text. */
  private fun bestResult(results: Bundle?): String {
    val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return ""
    if (list.isEmpty()) return ""
    val scores = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
    if (scores == null || scores.size < list.size) {
      return (list[0] ?: "").trim()
    }
    var best = ""
    var bestScore = -1f
    for (i in list.indices) {
      val candidate = (list[i] ?: "").trim()
      if (candidate.isEmpty()) continue
      if (scores[i] > bestScore) {
        bestScore = scores[i]
        best = candidate
      }
    }
    return if (best.isEmpty()) (list[0] ?: "").trim() else best
  }

  /** Sentences already committed plus the hypothesis being spoken right now. */
  private fun preview(partial: String): String {
    val base = transcript.toString().trim()
    return if (base.isEmpty()) partial else "$base $partial"
  }

  private fun describe(error: Int): String = when (error) {
    SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
    SpeechRecognizer.ERROR_NETWORK ->
      "Speech recognition needs the internet on this phone. Connect and try again, or use Whisper through Brown Desktop."
    SpeechRecognizer.ERROR_AUDIO -> "The microphone could not be read. Close other recording apps and try again."
    SpeechRecognizer.ERROR_SERVER -> "The speech recognition service failed. Try again."
    SpeechRecognizer.ERROR_CLIENT -> "Speech recognition was interrupted."
    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech was detected. Tap the mic and speak."
    SpeechRecognizer.ERROR_NO_MATCH -> "Nothing was recognized. Try again, a little closer to the mic."
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Another app is already using speech recognition."
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
      "Microphone permission is missing. Allow it in system settings, then try again."
    ERROR_UNAVAILABLE -> "This phone has no speech recognition service installed."
    else -> "Speech recognition failed (code $error)."
  }

  private companion object {
    const val EVENT_PARTIAL = "onSpeechPartial"
    const val EVENT_FINAL = "onSpeechFinal"
    const val EVENT_ERROR = "onSpeechError"
    const val EVENT_END = "onSpeechEnd"
    const val MAX_SESSION_MS = 60_000L
    const val RESTART_DELAY_MS = 180L

    // Local codes for failures the framework has no constant for.
    const val ERROR_UNAVAILABLE = -1
    const val ERROR_START_FAILED = -2
  }
}
