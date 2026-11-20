package com.madix.registration.record

/**
 * Shared monotonic timeline for audio and video. Presentation timestamps are
 * computed relative to [start], with paused intervals subtracted so the output
 * has no gap across pause/resume.
 */
class TimeBase {
    @Volatile var startNanos = 0L
        private set
    @Volatile private var pausedAccumNanos = 0L
    @Volatile private var pauseStartNanos = 0L
    @Volatile var paused = false
        private set

    fun start() {
        startNanos = System.nanoTime()
        pausedAccumNanos = 0L
        paused = false
    }

    fun pause() {
        if (!paused) {
            pauseStartNanos = System.nanoTime()
            paused = true
        }
    }

    fun resume() {
        if (paused) {
            pausedAccumNanos += System.nanoTime() - pauseStartNanos
            paused = false
        }
    }

    fun ptsUs(nowNanos: Long = System.nanoTime()): Long {
        return ((nowNanos - startNanos - pausedAccumNanos) / 1000L).coerceAtLeast(0L)
    }
}
