package com.madix.registration.record

import android.content.Context
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.projection.MediaProjection
import com.madix.registration.record.gl.CompositorPipeline
import java.io.File

data class RecordConfig(
    val width: Int,
    val height: Int,
    val dpi: Int,
    val fps: Int,
    val bitRate: Int,
    val audioMode: AudioMode,
    val facecam: Boolean,
    val facecamFront: Boolean,
)

/**
 * Orchestrates screen + optional facecam + audio into a single MP4 file using a
 * GL compositor that feeds a MediaCodec video encoder, plus an AAC audio encoder.
 */
class ScreenRecorder(
    private val context: Context,
    private val projection: MediaProjection,
    private val config: RecordConfig,
    val outputFile: File,
) {
    private val timeBase = TimeBase()
    private lateinit var muxer: MediaMuxerWrapper
    private lateinit var videoEncoder: VideoEncoder
    private var audioEncoder: AudioEncoder? = null
    private var pipeline: CompositorPipeline? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var cameraSource: CameraSource? = null

    var hasAudio = false
        private set

    fun start() {
        try {
            timeBase.start()

            // Audio: open sources first so the muxer knows the track count.
            val audio = if (config.audioMode != AudioMode.NONE) {
                AudioEncoder(config.audioMode, projection, timeBase)
            } else null
            hasAudio = audio?.prepare() == true
            audioEncoder = if (hasAudio) audio else null

            muxer = MediaMuxerWrapper(outputFile.absolutePath, hasAudio)
            videoEncoder = VideoEncoder(config.width, config.height, config.bitRate, config.fps, muxer)

            val pipe = CompositorPipeline(
                encoderSurface = videoEncoder.inputSurface,
                width = config.width,
                height = config.height,
                facecam = config.facecam,
                facecamFront = config.facecamFront,
                timeBase = timeBase,
            )
            pipe.start()
            pipeline = pipe

            videoEncoder.start()
            if (hasAudio) audioEncoder?.start(muxer)

            virtualDisplay = projection.createVirtualDisplay(
                "madix-screen",
                config.width, config.height, config.dpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                pipe.screenSurface, null, null,
            )

            if (config.facecam) {
                pipe.cameraSurface?.let { surface ->
                    cameraSource = CameraSource(context, config.facecamFront).also { it.start(surface) }
                }
            }
        } catch (e: Exception) {
            cleanup()
            throw e
        }
    }

    fun pause() = timeBase.pause()
    fun resume() = timeBase.resume()
    val isPaused: Boolean get() = timeBase.paused

    fun elapsedMs(): Long = timeBase.ptsUs() / 1000L

    fun stop() {
        runCatching { cameraSource?.stop() }
        runCatching { virtualDisplay?.release() }
        runCatching { pipeline?.stop() }
        runCatching { videoEncoder.signalEndOfStream() }
        runCatching { videoEncoder.stop() }
        runCatching { audioEncoder?.stop() }
        runCatching { muxer.stop() }
        cameraSource = null
        virtualDisplay = null
        pipeline = null
    }

    private fun cleanup() {
        runCatching { cameraSource?.stop() }
        runCatching { virtualDisplay?.release() }
        runCatching { pipeline?.stop() }
        runCatching { if (::videoEncoder.isInitialized) videoEncoder.stop() }
        runCatching { audioEncoder?.stop() }
        runCatching { if (::muxer.isInitialized) muxer.stop() }
    }
}
