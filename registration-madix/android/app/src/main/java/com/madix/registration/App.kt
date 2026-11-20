package com.madix.registration

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.madix.registration.data.AppGraph

class App : Application() {

    override fun onCreate() {
        super.onCreate()
        instance = this
        graph = AppGraph(this)
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                RECORD_CHANNEL_ID,
                getString(R.string.notif_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                setShowBadge(false)
                lockscreenVisibility = android.app.Notification.VISIBILITY_SECRET
            }
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        const val RECORD_CHANNEL_ID = "record_channel"
        lateinit var instance: App
            private set
        lateinit var graph: AppGraph
            private set
    }
}
