package com.madix.registration.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

class RecordingRepository(private val graph: AppGraph) {

    suspend fun list(before: String? = null): Result<List<Recording>> = withContext(Dispatchers.IO) {
        runCatching { graph.api.recordings(before).recordings }
    }

    suspend fun get(id: String): Result<Recording> = withContext(Dispatchers.IO) {
        runCatching { graph.api.recording(id).recording }
    }

    suspend fun rename(id: String, title: String): Result<Recording> = withContext(Dispatchers.IO) {
        runCatching { graph.api.renameRecording(id, RecordingRenameRequest(title)).recording }
    }

    suspend fun delete(id: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching { graph.api.deleteRecording(id); Unit }
    }

    /** Create metadata, stream the video file, then (optionally) the thumbnail. */
    suspend fun upload(
        videoFile: File,
        thumbFile: File?,
        meta: RecordingCreateRequest,
    ): Result<Recording> = withContext(Dispatchers.IO) {
        runCatching {
            val created = graph.api.createRecording(meta).recording
            val base = graph.serverBase()
            require(base.isNotEmpty()) { "server not configured" }

            val octet = "application/octet-stream".toMediaType()
            val putVideo = Request.Builder()
                .url("$base/api/recordings/${created.id}/video")
                .put(videoFile.asRequestBody(octet))
                .build()
            graph.okHttp.newCall(putVideo).execute().use { resp ->
                if (!resp.isSuccessful) throw RuntimeException("video upload failed: ${resp.code}")
            }

            if (thumbFile != null && thumbFile.exists()) {
                val jpeg = "image/jpeg".toMediaType()
                val putThumb = Request.Builder()
                    .url("$base/api/recordings/${created.id}/thumbnail")
                    .put(thumbFile.asRequestBody(jpeg))
                    .build()
                runCatching {
                    graph.okHttp.newCall(putThumb).execute().use { it.close() }
                }
            }

            graph.api.recording(created.id).recording
        }
    }

    fun videoUrl(id: String): String = "${graph.serverBase()}/api/recordings/$id/video"

    fun thumbnailUrl(id: String): String = "${graph.serverBase()}/api/recordings/$id/thumbnail"

    fun authHeader(): String = "Bearer ${graph.tokens.accessToken}"
}
