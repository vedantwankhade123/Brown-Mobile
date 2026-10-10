package expo.modules.brownaccount

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

/** System-owned transfers survive JS suspension, connectivity changes and process death. */
class BrownDownloadsModule : Module() {
  private val lock = Any()
  private fun context() = appContext.reactContext ?: error("Download context is unavailable.")
  private fun manager(ctx: Context) = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
  private fun prefs(ctx: Context) = ctx.getSharedPreferences("brown_background_downloads", Context.MODE_PRIVATE)
  private fun filename(key: String) = MessageDigest.getInstance("SHA-256")
    .digest(key.toByteArray()).joinToString("") { "%02x".format(it) } + ".part"

  override fun definition() = ModuleDefinition {
    Name("BrownDownloads")
    AsyncFunction("start") { key: String, url: String, label: String ->
      synchronized(lock) {
        val ctx = context()
        val settings = prefs(ctx)
        val dm = manager(ctx)
        val old = settings.getLong(key, -1)
        if (old != -1L) {
          val existing = query(ctx, key, old)
          if (existing["status"] != "missing" && existing["status"] != "error") return@synchronized existing
          dm.remove(old)
        }
        // HF redirects to short-lived signed CDN URLs. Bypass cached redirects
        // on each new attempt so a stale signature cannot strand the transfer.
        val suppliedUri = Uri.parse(url)
        val uri = if (suppliedUri.host == "huggingface.co") suppliedUri.buildUpon()
          .appendQueryParameter("brown_retry", System.currentTimeMillis().toString()).build() else suppliedUri
        require(uri.scheme == "https" || uri.scheme == "http") { "Invalid download URL." }
        val root = ctx.getExternalFilesDir("BrownDownloads") ?: error("Download storage is unavailable.")
        root.mkdirs()
        File(root, filename(key)).delete()
        val request = DownloadManager.Request(uri)
          .setTitle("Brown: $label")
          .setDescription("Downloading AI model. You can turn the screen off.")
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setAllowedOverMetered(true)
          .setAllowedOverRoaming(false)
          .setDestinationInExternalFilesDir(ctx, "BrownDownloads", filename(key))
          .addRequestHeader("Accept-Encoding", "identity")
          .addRequestHeader("Cache-Control", "no-cache")
          .addRequestHeader("User-Agent", "BrownAI-Mobile/1.0")
        val id = dm.enqueue(request)
        if (!settings.edit().putLong(key, id).commit()) {
          dm.remove(id)
          error("Could not save download state.")
        }
        query(ctx, key, id)
      }
    }
    AsyncFunction("status") { key: String ->
      synchronized(lock) {
        val ctx = context()
        query(ctx, key, prefs(ctx).getLong(key, -1))
      }
    }
    AsyncFunction("cancel") { key: String ->
      synchronized(lock) {
        val ctx = context()
        val settings = prefs(ctx)
        val id = settings.getLong(key, -1)
        if (id != -1L) manager(ctx).remove(id) // Stops the socket before deleting the partial.
        File(ctx.getExternalFilesDir("BrownDownloads"), filename(key)).delete()
        check(settings.edit().remove(key).commit()) { "Could not clear download state." }
      }
    }
    AsyncFunction("keys") {
      synchronized(lock) { prefs(context()).all.keys.toList() }
    }
  }

  private fun query(ctx: Context, key: String, id: Long): Map<String, Any> {
    if (id == -1L) return mapOf("status" to "missing")
    manager(ctx).query(DownloadManager.Query().setFilterById(id)).use { cursor ->
      if (cursor == null || !cursor.moveToFirst()) return mapOf("status" to "missing")
      val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
      val bytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
      val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
      val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
      return mapOf(
        "status" to when (status) {
          DownloadManager.STATUS_SUCCESSFUL -> "complete"
          DownloadManager.STATUS_FAILED -> "error"
          DownloadManager.STATUS_PAUSED -> "waiting"
          else -> "downloading"
        },
        "bytes" to bytes, "total" to total, "reason" to reason,
        "uri" to Uri.fromFile(File(ctx.getExternalFilesDir("BrownDownloads"), filename(key))).toString()
      )
    }
  }
}
