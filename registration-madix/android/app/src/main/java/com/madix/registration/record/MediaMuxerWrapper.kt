package com.madix.registration.record

import android.media.MediaCodec
import android.media.MediaFormat
import android.media.MediaMuxer
import java.nio.ByteBuffer

/**
 * Wraps [MediaMuxer] and starts it only once every expected track has reported
 * its output format, so video and (optionally) audio are interleaved correctly.
 */
class MediaMuxerWrapper(path: String, private val hasAudio: Boolean) {

    private val muxer = MediaMuxer(path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    private val expectedTracks = if (hasAudio) 2 else 1
    private var addedTracks = 0
    private var videoTrack = -1
    private var audioTrack = -1

    @Volatile var isStarted = false
        private set

    @Synchronized
    fun addVideoTrack(format: MediaFormat): Int {
        check(!isStarted) { "muxer already started" }
        videoTrack = muxer.addTrack(format)
        maybeStart()
        return videoTrack
    }

    @Synchronized
    fun addAudioTrack(format: MediaFormat): Int {
        check(!isStarted) { "muxer already started" }
        audioTrack = muxer.addTrack(format)
        maybeStart()
        return audioTrack
    }

    private fun maybeStart() {
        addedTracks++
        if (addedTracks >= expectedTracks) {
            muxer.start()
            isStarted = true
        }
    }

    @Synchronized
    fun writeSample(trackIndex: Int, buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
        if (!isStarted) return
        if (info.size <= 0) return
        if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) return
        muxer.writeSampleData(trackIndex, buffer, info)
    }

    @Synchronized
    fun stop() {
        if (isStarted) {
            runCatching { muxer.stop() }
        }
        runCatching { muxer.release() }
        isStarted = false
    }
}
