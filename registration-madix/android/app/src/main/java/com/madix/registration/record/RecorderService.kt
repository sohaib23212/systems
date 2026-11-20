package com.madix.registration.record

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.madix.registration.App
import com.madix.registration.MainActivity
import com.madix.registration.R
import com.madix.registration.data.RecordSettings
import com.madix.registration.data.SignalEvent
import com.madix.registration.data.SignalRole
import com.madix.registration.data.SignalingClient
import com.madix.registration.upload.UploadWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File

class RecorderService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var projection: MediaProjection? = null
    private var recorder: ScreenRecorder? = null
    private var signaling: SignalingClient? = null
    private var liveCapturer: LiveCapturer? = null
    private var tickerJob: Job? = null
    private var deviceId: String = ""
    private var currentFile: File? = null
    private var settings: RecordSettings = RecordSettings()
    private var liveViewers = 0

    private val batteryLowReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (settings.stopOnLowBattery) stopRecording()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> handleStart(intent)
            ACTION_STOP -> stopRecording()
            ACTION_PAUSE -> pause()
            ACTION_RESUME -> resume()
        }
        return START_NOT_STICKY
    }

    private fun handleStart(intent: Intent) {
        if (RecorderController.isActive) return
        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val data = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_RESULT_DATA)
        }
        if (resultCode == 0 || data == null) {
            stopSelf()
            return
        }
        settings = App.graph.settings.value

        // Start foreground before touching MediaProjection (required on recent Android).
        startForegroundNotification(preparing = true)

        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val mp = runCatching { mpm.getMediaProjection(resultCode, data) }.getOrNull()
        if (mp == null) {
            RecorderController.setError("تعذّر بدء التسجيل")
            stopSelf()
            return
        }
        projection = mp
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                stopRecording()
            }
        }, null)

        ContextCompat.registerReceiver(
            this, batteryLowReceiver,
            IntentFilter(Intent.ACTION_BATTERY_LOW),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )

        scope.launch { startRecordingFlow(mp) }
    }

    private suspend fun startRecordingFlow(mp: MediaProjection) {
        // Register device (for presence / live / upload metadata).
        App.graph.deviceRepo.ensureRegistered(canLive = true)
            .onSuccess { deviceId = it.id }

        // Countdown.
        val countdown = settings.countdownSeconds
        if (countdown > 0) {
            RecorderController.setState(RecorderController.State.COUNTDOWN)
            for (i in countdown downTo 1) {
                RecorderController.setCountdown(i)
                delay(1000)
            }
            RecorderController.setCountdown(0)
        }

        val config = buildConfig(settings)
        val file = LocalFiles.newRecordingFile(this)
        currentFile = file

        val rec = ScreenRecorder(this, mp, config, file)
        try {
            rec.start()
        } catch (e: Exception) {
            RecorderController.setError("فشل بدء التسجيل: ${e.message}")
            RecorderController.setState(RecorderController.State.IDLE)
            cleanupAfterFailure()
            return
        }
        recorder = rec
        RecorderController.setState(RecorderController.State.RECORDING)
        startForegroundNotification(preparing = false)

        connectSignaling()
        startTicker()
    }

    private fun buildConfig(s: RecordSettings): RecordConfig {
        val metrics = resources.displayMetrics
        val scale = s.resolutionPercent.coerceIn(30, 100) / 100f
        var w = (metrics.widthPixels * scale).toInt()
        var h = (metrics.heightPixels * scale).toInt()
        w -= w % 2
        h -= h % 2
        if (w < 2) w = 2
        if (h < 2) h = 2
        val audioMode = when (s.audioMode) {
            "none" -> AudioMode.NONE
            "internal" -> AudioMode.INTERNAL
            "both" -> AudioMode.BOTH
            else -> AudioMode.MIC
        }
        val micGranted = ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        val camGranted = ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        val effectiveAudio = when {
            audioMode == AudioMode.NONE -> AudioMode.NONE
            (audioMode == AudioMode.MIC || audioMode == AudioMode.BOTH) && !micGranted ->
                if (audioMode == AudioMode.BOTH) AudioMode.INTERNAL else AudioMode.NONE
            else -> audioMode
        }
        val facecam = s.facecam && camGranted
        return RecordConfig(
            width = w,
            height = h,
            dpi = metrics.densityDpi,
            fps = s.fps.coerceIn(15, 60),
            bitRate = s.bitrateMbps.coerceIn(2, 50) * 1_000_000,
            audioMode = effectiveAudio,
            facecam = facecam,
            facecamFront = s.facecamFront,
        )
    }

    private fun startTicker() {
        tickerJob?.cancel()
        tickerJob = scope.launch {
            while (RecorderController.isActive) {
                recorder?.let { RecorderController.setElapsed(it.elapsedMs()) }
                delay(500)
            }
        }
    }

    private fun connectSignaling() {
        if (deviceId.isEmpty()) return
        val client = SignalingClient(App.graph, SignalRole.DEVICE, deviceId, canLive = true)
        signaling = client
        scope.launch {
            client.events.collect { event ->
                when (event) {
                    is SignalEvent.Connected -> client.sendPresence(true)
                    is SignalEvent.Command -> if (event.command == "stop") stopRecording()
                    is SignalEvent.LiveStart -> startLive()
                    is SignalEvent.LiveStop -> stopLive()
                    else -> {}
                }
            }
        }
        client.connect()
    }

    private fun startLive() {
        val mp = projection ?: return
        if (liveCapturer != null) return
        val metrics = resources.displayMetrics
        val capturer = LiveCapturer(
            projection = mp,
            screenWidth = metrics.widthPixels,
            screenHeight = metrics.heightPixels,
            dpi = metrics.densityDpi,
            maxWidth = settings.liveMaxWidth,
            fps = settings.liveFps,
            onFrame = { bytes -> signaling?.sendFrame(bytes) },
        )
        liveCapturer = capturer
        capturer.start()
        liveViewers = 1
        RecorderController.setLiveViewers(liveViewers)
    }

    private fun stopLive() {
        liveCapturer?.stop()
        liveCapturer = null
        liveViewers = 0
        RecorderController.setLiveViewers(0)
    }

    private fun pause() {
        recorder?.pause()
        RecorderController.setState(RecorderController.State.PAUSED)
        signaling?.sendPresence(true)
        startForegroundNotification(preparing = false)
    }

    private fun resume() {
        recorder?.resume()
        RecorderController.setState(RecorderController.State.RECORDING)
        startForegroundNotification(preparing = false)
    }

    private fun stopRecording() {
        if (recorder == null && !RecorderController.isActive) {
            stopSelf()
            return
        }
        val rec = recorder
        val file = currentFile
        tickerJob?.cancel()
        stopLive()
        signaling?.sendPresence(false)

        scope.launch {
            runCatching { rec?.stop() }
            val hasAudio = rec?.hasAudio ?: false
            runCatching { projection?.stop() }
            signaling?.close()

            RecorderController.setState(RecorderController.State.IDLE)
            RecorderController.setElapsed(0)

            if (file != null && file.exists() && file.length() > 0) {
                queueUpload(file, hasAudio)
            }
            stopForegroundCompat()
            stopSelf()
        }
    }

    private fun queueUpload(file: File, hasAudio: Boolean) {
        val thumb = LocalFiles.generateThumbnail(file)
        val duration = LocalFiles.readDurationMs(file)
        val metrics = resources.displayMetrics
        val name = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
        UploadWorker.enqueue(
            context = applicationContext,
            video = file,
            thumb = thumb,
            title = defaultTitle(),
            deviceId = deviceId,
            deviceName = name,
            durationMs = duration,
            width = metrics.widthPixels,
            height = metrics.heightPixels,
            hasAudio = hasAudio,
            requireWifi = settings.uploadOnWifiOnly,
            deleteAfter = true,
        )
    }

    private fun defaultTitle(): String {
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.getDefault())
        return "تسجيل ${fmt.format(java.util.Date())}"
    }

    private fun cleanupAfterFailure() {
        tickerJob?.cancel()
        runCatching { projection?.stop() }
        signaling?.close()
        stopForegroundCompat()
        stopSelf()
    }

    // ---- Notification ----

    private fun startForegroundNotification(preparing: Boolean) {
        val notification = buildNotification(preparing)
        val type = currentForegroundType()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, type)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun currentForegroundType(): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
        var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        val micGranted = ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        val camGranted = ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (micGranted && (settings.audioMode == "mic" || settings.audioMode == "both")) {
                type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            }
            if (camGranted && settings.facecam) {
                type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            }
        }
        return type
    }

    private fun buildNotification(preparing: Boolean): Notification {
        val paused = RecorderController.state.value == RecorderController.State.PAUSED
        val contentIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val title = when {
            preparing -> getString(R.string.app_name)
            paused -> getString(R.string.notif_paused_title)
            else -> getString(R.string.notif_recording_title)
        }
        val builder = NotificationCompat.Builder(this, App.RECORD_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_record)
            .setContentTitle(title)
            .setOngoing(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setContentIntent(contentIntent)
            .setShowWhen(false)

        if (!preparing) {
            builder.addAction(
                0, getString(R.string.stop_recording),
                servicePending(ACTION_STOP, 1),
            )
            if (paused) {
                builder.addAction(0, getString(R.string.resume), servicePending(ACTION_RESUME, 2))
            } else {
                builder.addAction(0, getString(R.string.pause), servicePending(ACTION_PAUSE, 3))
            }
        }
        return builder.build()
    }

    private fun servicePending(action: String, code: Int): PendingIntent {
        val intent = Intent(this, RecorderService::class.java).setAction(action)
        return PendingIntent.getService(this, code, intent, PendingIntent.FLAG_IMMUTABLE)
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION") stopForeground(true)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        runCatching { unregisterReceiver(batteryLowReceiver) }
        tickerJob?.cancel()
        runCatching { liveCapturer?.stop() }
        runCatching { signaling?.close() }
        scope.coroutineContext[Job]?.cancel()
    }

    companion object {
        const val NOTIF_ID = 42
        const val ACTION_START = "com.madix.registration.START"
        const val ACTION_STOP = "com.madix.registration.STOP"
        const val ACTION_PAUSE = "com.madix.registration.PAUSE"
        const val ACTION_RESUME = "com.madix.registration.RESUME"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"

        fun startIntent(context: Context, resultCode: Int, data: Intent): Intent {
            return Intent(context, RecorderService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_RESULT_CODE, resultCode)
                putExtra(EXTRA_RESULT_DATA, data)
            }
        }

        fun stopIntent(context: Context): Intent =
            Intent(context, RecorderService::class.java).setAction(ACTION_STOP)
    }
}
