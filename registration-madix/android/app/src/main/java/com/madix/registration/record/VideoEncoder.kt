package com.madix.registration.record

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.view.Surface
import java.util.concurrent.atomic.AtomicBoolean

class VideoEncoder(
    width: Int,
    height: Int,
    bitRate: Int,
    frameRate: Int,
    private val muxer: MediaMuxerWrapper,
) {
    private val codec: MediaCodec
    val inputSurface: Surface
    private var trackIndex = -1
    private val bufferInfo = MediaCodec.BufferInfo()
    private val draining = AtomicBoolean(false)
    private var drainThread: Thread? = null
    @Volatile private var stopRequested = false

    init {
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
            setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
            setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)
        }
        codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        inputSurface = codec.createInputSurface()
    }

    fun start() {
        codec.start()
        stopRequested = false
        drainThread = Thread({ drainLoop() }, "video-drain").also { it.start() }
    }

    private fun drainLoop() {
        while (true) {
            val index = codec.dequeueOutputBuffer(bufferInfo, 10_000)
            when {
                index == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (stopRequested) break
                }
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    trackIndex = muxer.addVideoTrack(codec.outputFormat)
                }
                index >= 0 -> {
                    val encoded = codec.getOutputBuffer(index)
                    if (encoded != null && trackIndex >= 0) {
                        encoded.position(bufferInfo.offset)
                        encoded.limit(bufferInfo.offset + bufferInfo.size)
                        muxer.writeSample(trackIndex, encoded, bufferInfo)
                    }
                    codec.releaseOutputBuffer(index, false)
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
                }
            }
        }
    }

    /** Called by the GL thread after the final frame is swapped. */
    fun signalEndOfStream() {
        runCatching { codec.signalEndOfInputStream() }
    }

    fun stop() {
        stopRequested = true
        runCatching { drainThread?.join(1500) }
        runCatching { codec.stop() }
        runCatching { codec.release() }
        runCatching { inputSurface.release() }
    }
}
