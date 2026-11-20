package com.madix.registration.record

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import java.io.File
import java.io.FileOutputStream

/**
 * Private, in-app storage for recordings. Files live under the app's internal
 * storage only (never MediaStore / gallery). They are staged here, uploaded to
 * the cloud, then removed on success.
 */
object LocalFiles {

    fun recordingsDir(context: Context): File {
        val dir = File(context.filesDir, "recordings")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    fun newRecordingFile(context: Context): File {
        val name = "rec_${System.currentTimeMillis()}.mp4"
        return File(recordingsDir(context), name)
    }

    fun thumbnailFor(videoFile: File): File {
        return File(videoFile.parentFile, videoFile.nameWithoutExtension + ".jpg")
    }

    /** Extract a representative frame as a JPEG next to the video. Returns it or null. */
    fun generateThumbnail(videoFile: File): File? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(videoFile.absolutePath)
            val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull() ?: 0L
            val atUs = (durationMs / 3).coerceAtLeast(0) * 1000L
            val frame = retriever.getFrameAtTime(atUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                ?: retriever.frameAtTime
                ?: return null
            val scaled = scaleDown(frame, 640)
            val out = thumbnailFor(videoFile)
            FileOutputStream(out).use { scaled.compress(Bitmap.CompressFormat.JPEG, 80, it) }
            if (scaled !== frame) scaled.recycle()
            frame.recycle()
            out
        } catch (_: Exception) {
            null
        } finally {
            runCatching { retriever.release() }
        }
    }

    fun readDurationMs(videoFile: File): Long {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(videoFile.absolutePath)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        } catch (_: Exception) {
            0L
        } finally {
            runCatching { retriever.release() }
        }
    }

    private fun scaleDown(bitmap: Bitmap, maxWidth: Int): Bitmap {
        if (bitmap.width <= maxWidth) return bitmap
        val ratio = maxWidth.toFloat() / bitmap.width
        val h = (bitmap.height * ratio).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(bitmap, maxWidth, h, true)
    }
}
