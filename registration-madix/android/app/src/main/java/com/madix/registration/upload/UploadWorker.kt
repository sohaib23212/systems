package com.madix.registration.upload

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.madix.registration.App
import com.madix.registration.data.RecordingCreateRequest
import java.io.File

class UploadWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val videoPath = inputData.getString(KEY_VIDEO) ?: return Result.failure()
        val video = File(videoPath)
        if (!video.exists()) return Result.failure()

        val thumbPath = inputData.getString(KEY_THUMB)
        val thumb = thumbPath?.let { File(it) }?.takeIf { it.exists() }

        val meta = RecordingCreateRequest(
            deviceId = inputData.getString(KEY_DEVICE_ID)?.ifEmpty { null },
            deviceName = inputData.getString(KEY_DEVICE_NAME) ?: "",
            title = inputData.getString(KEY_TITLE) ?: "",
            durationMs = inputData.getLong(KEY_DURATION, 0),
            width = inputData.getInt(KEY_WIDTH, 0),
            height = inputData.getInt(KEY_HEIGHT, 0),
            hasAudio = inputData.getBoolean(KEY_HAS_AUDIO, false),
        )

        val graph = App.graph
        val result = graph.recordingRepo.upload(video, thumb, meta)
        return if (result.isSuccess) {
            if (inputData.getBoolean(KEY_DELETE_AFTER, true)) {
                runCatching { video.delete() }
                runCatching { thumb?.delete() }
            }
            Result.success()
        } else {
            if (runAttemptCount < 5) Result.retry() else Result.failure()
        }
    }

    companion object {
        const val KEY_VIDEO = "video"
        const val KEY_THUMB = "thumb"
        const val KEY_TITLE = "title"
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_DEVICE_NAME = "device_name"
        const val KEY_DURATION = "duration"
        const val KEY_WIDTH = "width"
        const val KEY_HEIGHT = "height"
        const val KEY_HAS_AUDIO = "has_audio"
        const val KEY_DELETE_AFTER = "delete_after"

        fun enqueue(
            context: Context,
            video: File,
            thumb: File?,
            title: String,
            deviceId: String,
            deviceName: String,
            durationMs: Long,
            width: Int,
            height: Int,
            hasAudio: Boolean,
            requireWifi: Boolean,
            deleteAfter: Boolean,
        ) {
            val data = Data.Builder()
                .putString(KEY_VIDEO, video.absolutePath)
                .putString(KEY_THUMB, thumb?.absolutePath)
                .putString(KEY_TITLE, title)
                .putString(KEY_DEVICE_ID, deviceId)
                .putString(KEY_DEVICE_NAME, deviceName)
                .putLong(KEY_DURATION, durationMs)
                .putInt(KEY_WIDTH, width)
                .putInt(KEY_HEIGHT, height)
                .putBoolean(KEY_HAS_AUDIO, hasAudio)
                .putBoolean(KEY_DELETE_AFTER, deleteAfter)
                .build()

            val constraints = androidx.work.Constraints.Builder()
                .setRequiredNetworkType(
                    if (requireWifi) androidx.work.NetworkType.UNMETERED
                    else androidx.work.NetworkType.CONNECTED
                )
                .build()

            val request = OneTimeWorkRequestBuilder<UploadWorker>()
                .setInputData(data)
                .setConstraints(constraints)
                .setBackoffCriteria(
                    androidx.work.BackoffPolicy.EXPONENTIAL,
                    30_000, java.util.concurrent.TimeUnit.MILLISECONDS,
                )
                .build()

            WorkManager.getInstance(context)
                .enqueueUniqueWork("upload_${video.name}", ExistingWorkPolicy.KEEP, request)
        }
    }
}
