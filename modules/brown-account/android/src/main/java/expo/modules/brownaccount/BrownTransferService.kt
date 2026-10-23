package expo.modules.brownaccount

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.Build

/** Keeps native streaming transfers alive with the screen off, without a screen wake lock. */
class BrownTransferService : Service() {
  private val transfers = mutableSetOf<String>()

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val key = intent?.getStringExtra("key") ?: return START_NOT_STICKY
    if (intent.action == "release") {
      transfers.remove(key)
      if (transfers.isEmpty()) { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(startId) }
      return START_NOT_STICKY
    }
    transfers.add(key)
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      manager.createNotificationChannel(NotificationChannel("brown_transfers", "Model downloads", NotificationManager.IMPORTANCE_LOW))
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, "brown_transfers") else Notification.Builder(this)
    val notification = builder
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle("Brown model download")
      .setContentText("Downloading in the background. You can turn the screen off.")
      .setOngoing(true).build()
    startForeground(2417, notification)
    // Process termination leaves a resumable partial. The app restores its row
    // as paused; a service without an active socket must never restart itself.
    return START_NOT_STICKY
  }
}
