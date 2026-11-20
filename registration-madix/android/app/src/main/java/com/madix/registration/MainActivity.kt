package com.madix.registration

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.madix.registration.record.RecorderController
import com.madix.registration.record.RecorderService
import com.madix.registration.ui.AppRoot
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : FragmentActivity() {

    private val mediaProjectionManager by lazy {
        getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    }

    private var pendingQuickRecord = false

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        // Proceed regardless; the service adapts to whatever was granted.
        launchProjection()
    }

    private val projectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK && result.data != null) {
            val intent = RecorderService.startIntent(this, result.resultCode, result.data!!)
            ContextCompat.startForegroundService(this, intent)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)
        setContent {
            AppRoot(
                onStartRecording = ::requestStartRecording,
                onStopRecording = ::stopRecording,
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.action == ACTION_QUICK_RECORD) {
            pendingQuickRecord = true
            quickRecordRequest.value = System.currentTimeMillis()
        }
    }

    fun requestStartRecording() {
        if (RecorderController.isActive) return
        val settings = App.graph.settings.value
        val needed = buildList {
            if (Build.VERSION.SDK_INT >= 33) add(android.Manifest.permission.POST_NOTIFICATIONS)
            if (settings.audioMode == "mic" || settings.audioMode == "both") {
                add(android.Manifest.permission.RECORD_AUDIO)
            }
            if (settings.facecam) add(android.Manifest.permission.CAMERA)
        }.filter {
            ContextCompat.checkSelfPermission(this, it) != android.content.pm.PackageManager.PERMISSION_GRANTED
        }
        if (needed.isNotEmpty()) {
            permissionLauncher.launch(needed.toTypedArray())
        } else {
            launchProjection()
        }
    }

    private fun launchProjection() {
        runCatching {
            projectionLauncher.launch(mediaProjectionManager.createScreenCaptureIntent())
        }
    }

    private fun stopRecording() {
        startService(RecorderService.stopIntent(this))
    }

    companion object {
        const val ACTION_QUICK_RECORD = "com.madix.registration.QUICK_RECORD"
        // Signals a quick-record request from the tile to the composition.
        val quickRecordRequest = MutableStateFlow(0L)
    }
}
