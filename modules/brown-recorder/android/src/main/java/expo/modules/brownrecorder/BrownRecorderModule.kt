package expo.modules.brownrecorder

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import kotlin.concurrent.thread

/**
 * 16 kHz mono 16-bit PCM capture → WAV files for Whisper STT.
 * expo-av on Android is MediaRecorder (AAC only) and cannot produce PCM WAV.
 */
class BrownRecorderModule : Module() {
  private var recordThread: Thread? = null

  @Volatile
  private var recording = false
  private var pcm: ByteArrayOutputStream? = null
  private var audioRecord: AudioRecord? = null

  override fun definition() = ModuleDefinition {
    Name("BrownRecorder")

    Function("start") {
      startCapture()
    }

    Function("stop") {
      stopAndSave()
    }

    Function("isRecording") {
      recording
    }
    OnDestroy {
      recording = false
      try { audioRecord?.stop() } catch (@Suppress("unused") e: Exception) {}
      recordThread?.join(500)
      pcm = null
    }
  }

  private fun startCapture(): Boolean {
    if (recording) return true
    val sampleRate = 16000
    val minBuf = AudioRecord.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    if (minBuf <= 0) return false
    val bufSize = maxOf(minBuf, sampleRate / 5 * 2) // >= 200 ms per read
    val record: AudioRecord = try {
      AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufSize * 4
      )
    } catch (e: SecurityException) {
      return false
    }
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      return false
    }

    val out = ByteArrayOutputStream()
    pcm = out
    try {
      record.startRecording()
    } catch (@Suppress("unused") e: Exception) {
      record.release()
      pcm = null
      return false
    }
    audioRecord = record
    recording = true
    recordThread = thread(name = "brown-recorder") {
      val buffer = ByteArray(bufSize)
      val maxBytes = sampleRate * 2 * 35 // hard cap ~35 s
      try {
        while (recording) {
          val read = record.read(buffer, 0, buffer.size)
          if (read > 0) out.write(buffer, 0, read)
          if (read < 0) break
          if (out.size() > maxBytes) break
        }
      } catch (@Suppress("unused") e: Exception) {
      }
      try {
        record.stop()
      } catch (@Suppress("unused") e: Exception) {
      }
      record.release()
    }
    return true
  }

  private fun stopAndSave(): String? {
    if (!recording) return null
    recording = false
    try { audioRecord?.stop() } catch (@Suppress("unused") e: Exception) {}
    recordThread?.join(1500)
    audioRecord = null
    recordThread = null
    val out = pcm
    pcm = null
    val bytes = out?.toByteArray() ?: return null
    val ctx = appContext.reactContext ?: return null
    val dir = File(ctx.cacheDir, "Audio")
    if (!dir.exists()) dir.mkdirs()
    val file = File(dir, "brown-stt-${System.currentTimeMillis()}.wav")
    writeWav(file, bytes, 16000)
    return "file://" + file.absolutePath
  }

  private fun writeWav(file: File, data: ByteArray, sampleRate: Int) {
    FileOutputStream(file).use { os ->
      val channels = 1
      val bits = 16
      val byteRate = sampleRate * channels * bits / 8
      val header = ByteArray(44)
      fun putStr(off: Int, s: String) = s.toByteArray(Charsets.US_ASCII).copyInto(header, off)
      fun putI32(off: Int, v: Int) {
        header[off] = v.toByte()
        header[off + 1] = (v ushr 8).toByte()
        header[off + 2] = (v ushr 16).toByte()
        header[off + 3] = (v ushr 24).toByte()
      }
      fun putI16(off: Int, v: Int) {
        header[off] = v.toByte()
        header[off + 1] = (v ushr 8).toByte()
      }
      putStr(0, "RIFF")
      putI32(4, 36 + data.size)
      putStr(8, "WAVE")
      putStr(12, "fmt ")
      putI32(16, 16)
      putI16(20, 1)
      putI16(22, channels)
      putI32(24, sampleRate)
      putI32(28, byteRate)
      putI16(32, channels * bits / 8)
      putI16(34, bits)
      putStr(36, "data")
      putI32(40, data.size)
      os.write(header)
      os.write(data)
    }
  }
}
