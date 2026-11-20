package com.madix.registration.record

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface

/**
 * Streams the front or rear camera to a target [Surface] using Camera2.
 * Used to feed the facecam overlay texture. Best-effort: failures are swallowed
 * so a missing camera never breaks the screen recording.
 */
class CameraSource(
    private val context: Context,
    private val front: Boolean,
) {
    private var cameraDevice: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var thread: HandlerThread? = null
    private var handler: Handler? = null

    @SuppressLint("MissingPermission")
    fun start(target: Surface) {
        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val cameraId = pickCamera(manager) ?: return
        thread = HandlerThread("camera-src").also { it.start() }
        handler = Handler(thread!!.looper)
        try {
            manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(device: CameraDevice) {
                    cameraDevice = device
                    createSession(device, target)
                }

                override fun onDisconnected(device: CameraDevice) {
                    device.close()
                    cameraDevice = null
                }

                override fun onError(device: CameraDevice, error: Int) {
                    device.close()
                    cameraDevice = null
                }
            }, handler)
        } catch (_: Exception) {
            stop()
        }
    }

    @Suppress("DEPRECATION")
    private fun createSession(device: CameraDevice, target: Surface) {
        try {
            val request = device.createCaptureRequest(CameraDevice.TEMPLATE_RECORD).apply {
                addTarget(target)
                set(CaptureRequest.CONTROL_MODE, CameraCharacteristics.CONTROL_MODE_AUTO)
            }
            device.createCaptureSession(
                listOf(target),
                object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(configured: CameraCaptureSession) {
                        session = configured
                        runCatching {
                            configured.setRepeatingRequest(request.build(), null, handler)
                        }
                    }

                    override fun onConfigureFailed(configured: CameraCaptureSession) {}
                },
                handler,
            )
        } catch (_: Exception) {
            stop()
        }
    }

    private fun pickCamera(manager: CameraManager): String? {
        return try {
            val target = if (front) {
                CameraCharacteristics.LENS_FACING_FRONT
            } else {
                CameraCharacteristics.LENS_FACING_BACK
            }
            manager.cameraIdList.firstOrNull { id ->
                manager.getCameraCharacteristics(id)
                    .get(CameraCharacteristics.LENS_FACING) == target
            } ?: manager.cameraIdList.firstOrNull()
        } catch (_: Exception) {
            null
        }
    }

    fun stop() {
        runCatching { session?.close() }
        runCatching { cameraDevice?.close() }
        runCatching { thread?.quitSafely() }
        session = null
        cameraDevice = null
        thread = null
        handler = null
    }
}
