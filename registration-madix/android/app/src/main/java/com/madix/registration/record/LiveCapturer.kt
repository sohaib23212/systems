package com.madix.registration.record

import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread
import java.io.ByteArrayOutputStream

/**
 * Low-resolution live screen feed. Uses a separate VirtualDisplay of the same
 * MediaProjection to grab downscaled frames via ImageReader, compressing each to
 * JPEG and handing it to [onFrame] at roughly [fps]. Independent of the recorder.
 */
class LiveCapturer(
    private val projection: MediaProjection,
    private val screenWidth: Int,
    private val screenHeight: Int,
    private val dpi: Int,
    maxWidth: Int,
    private val fps: Int,
    private val quality: Int = 50,
    private val onFrame: (ByteArray) -> Unit,
) {
    private val targetWidth: Int
    private val targetHeight: Int

    private var imageReader: ImageReader? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var reusableBitmap: Bitmap? = null

    @Volatile private var lastFrameAt = 0L
    private val minIntervalMs = (1000L / fps.coerceIn(1, 15))

    init {
        val mw = maxWidth.coerceIn(160, 1080)
        val scale = if (screenWidth > mw) mw.toFloat() / screenWidth else 1f
        // Keep dimensions even.
        targetWidth = ((screenWidth * scale).toInt() / 2) * 2
        targetHeight = ((screenHeight * scale).toInt() / 2) * 2
    }

    fun start() {
        thread = HandlerThread("live-capture").also { it.start() }
        handler = Handler(thread!!.looper)
        val reader = ImageReader.newInstance(targetWidth, targetHeight, PixelFormat.RGBA_8888, 2)
        imageReader = reader
        reader.setOnImageAvailableListener({ onImage(it) }, handler)
        virtualDisplay = projection.createVirtualDisplay(
            "madix-live",
            targetWidth, targetHeight, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.surface, null, handler,
        )
    }

    private fun onImage(reader: ImageReader) {
        val image = try {
            reader.acquireLatestImage()
        } catch (_: Exception) {
            null
        } ?: return
        try {
            val now = System.currentTimeMillis()
            if (now - lastFrameAt < minIntervalMs) return
            lastFrameAt = now

            val plane = image.planes[0]
            val buffer = plane.buffer
            val pixelStride = plane.pixelStride
            val rowStride = plane.rowStride
            val rowPadding = rowStride - pixelStride * targetWidth
            val bmpWidth = targetWidth + rowPadding / pixelStride

            var bmp = reusableBitmap
            if (bmp == null || bmp.width != bmpWidth || bmp.height != targetHeight) {
                bmp?.recycle()
                bmp = Bitmap.createBitmap(bmpWidth, targetHeight, Bitmap.Config.ARGB_8888)
                reusableBitmap = bmp
            }
            buffer.rewind()
            bmp.copyPixelsFromBuffer(buffer)

            val output = if (bmpWidth != targetWidth) {
                Bitmap.createBitmap(bmp, 0, 0, targetWidth, targetHeight)
            } else {
                bmp
            }

            val baos = ByteArrayOutputStream()
            output.compress(Bitmap.CompressFormat.JPEG, quality, baos)
            if (output !== bmp) output.recycle()
            onFrame(baos.toByteArray())
        } catch (_: Exception) {
            // Drop this frame.
        } finally {
            image.close()
        }
    }

    fun stop() {
        runCatching { virtualDisplay?.release() }
        runCatching { imageReader?.close() }
        runCatching { thread?.quitSafely() }
        reusableBitmap?.recycle()
        reusableBitmap = null
        virtualDisplay = null
        imageReader = null
        thread = null
        handler = null
    }
}
