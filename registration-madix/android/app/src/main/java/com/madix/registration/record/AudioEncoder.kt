package com.madix.registration.record

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.os.Build
import java.util.concurrent.atomic.AtomicBoolean

enum class AudioMode { NONE, MIC, INTERNAL, BOTH }

/**
 * Captures microphone and/or internal (playback) audio, mixes to mono PCM, and
 * encodes to AAC. Call [prepare] first to open the audio sources; its result
 * tells the recorder whether an audio track will exist, so the muxer can be
 * built with the correct track count. Internal capture needs Android 10+.
 */
class AudioEncoder(
    private val mode: AudioMode,
    private val mediaProjection: MediaProjection?,
    private val timeBase: TimeBase,
) {
    private val sampleRate = 44100
    private val channelConfig = AudioFormat.CHANNEL_IN_MONO
    private val audioFormat = AudioFormat.ENCODING_PCM_16BIT

    private lateinit var codec: MediaCodec
    private lateinit var muxer: MediaMuxerWrapper
    private var trackIndex = -1
    private val bufferInfo = MediaCodec.BufferInfo()

    private var micRecord: AudioRecord? = null
    private var internalRecord: AudioRecord? = null
    private var captureThread: Thread? = null
    private var drainThread: Thread? = null
    private val running = AtomicBoolean(false)

    private val minBuffer = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
        .coerceAtLeast(4096)

    @SuppressLint("MissingPermission")
    fun prepare(): Boolean {
        if (mode == AudioMode.NONE) return false
        val wantMic = mode == AudioMode.MIC || mode == AudioMode.BOTH
        val wantInternal = (mode == AudioMode.INTERNAL || mode == AudioMode.BOTH) &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && mediaProjection != null

        if (wantMic) {
            micRecord = runCatching {
                AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    sampleRate, channelConfig, audioFormat, minBuffer,
                ).takeIf { it.state == AudioRecord.STATE_INITIALIZED }
            }.getOrNull()
        }
        if (wantInternal) {
            internalRecord = buildInternalRecord()
        }
        return micRecord != null || internalRecord != null
    }

    fun start(muxer: MediaMuxerWrapper) {
        this.muxer = muxer
        val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, 1).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, 128_000)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, minBuffer * 2)
        }
        codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()

        micRecord?.startRecording()
        internalRecord?.startRecording()

        running.set(true)
        captureThread = Thread({ captureLoop() }, "audio-capture").also { it.start() }
        drainThread = Thread({ drainLoop() }, "audio-drain").also { it.start() }
    }

    @SuppressLint("MissingPermission")
    private fun buildInternalRecord(): AudioRecord? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || mediaProjection == null) return null
        return try {
            val config = AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build()
            val fmt = AudioFormat.Builder()
                .setEncoding(audioFormat)
                .setSampleRate(sampleRate)
                .setChannelMask(channelConfig)
                .build()
            AudioRecord.Builder()
                .setAudioPlaybackCaptureConfig(config)
                .setAudioFormat(fmt)
                .setBufferSizeInBytes(minBuffer)
                .build()
                .takeIf { it.state == AudioRecord.STATE_INITIALIZED }
        } catch (_: Exception) {
            null
        }
    }

    private fun captureLoop() {
        val mic = micRecord
        val internal = internalRecord
        val micBuf = ShortArray(minBuffer / 2)
        val intBuf = ShortArray(minBuffer / 2)
        while (running.get()) {
            val mN = if (mic != null) mic.read(micBuf, 0, micBuf.size) else 0
            val iN = if (internal != null) internal.read(intBuf, 0, intBuf.size) else 0
            val n = maxOf(maxOf(mN, 0), maxOf(iN, 0))
            if (n <= 0) continue
            if (timeBase.paused) continue

            val mixed = ShortArray(n)
            for (i in 0 until n) {
                var s = 0
                if (mN > i) s += micBuf[i].toInt()
                if (iN > i) s += intBuf[i].toInt()
                mixed[i] = s.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
            }
            feed(mixed, n)
        }
        feedEos()
    }

    private fun feed(data: ShortArray, count: Int) {
        val index = codec.dequeueInputBuffer(10_000)
        if (index < 0) return
        val buffer = codec.getInputBuffer(index) ?: return
        buffer.clear()
        val bytes = count * 2
        buffer.asShortBuffer().put(data, 0, count)
        buffer.position(0)
        buffer.limit(bytes)
        codec.queueInputBuffer(index, 0, bytes, timeBase.ptsUs(), 0)
    }

    private fun feedEos() {
        val index = codec.dequeueInputBuffer(50_000)
        if (index >= 0) {
            codec.queueInputBuffer(index, 0, 0, timeBase.ptsUs(), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
        }
    }

    private fun drainLoop() {
        while (true) {
            val index = codec.dequeueOutputBuffer(bufferInfo, 10_000)
            when {
                index == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (!running.get()) break
                }
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    trackIndex = muxer.addAudioTrack(codec.outputFormat)
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

    fun stop() {
        running.set(false)
        runCatching { captureThread?.join(1500) }
        runCatching { drainThread?.join(1500) }
        runCatching { micRecord?.stop() }
        runCatching { micRecord?.release() }
        runCatching { internalRecord?.stop() }
        runCatching { internalRecord?.release() }
        if (::codec.isInitialized) {
            runCatching { codec.stop() }
            runCatching { codec.release() }
        }
    }
}
