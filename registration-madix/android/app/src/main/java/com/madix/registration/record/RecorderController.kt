package com.madix.registration.record

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Shared recording state observed by the UI and updated by [RecorderService]. */
object RecorderController {

    enum class State { IDLE, COUNTDOWN, RECORDING, PAUSED }

    private val _state = MutableStateFlow(State.IDLE)
    val state: StateFlow<State> = _state.asStateFlow()

    private val _elapsedMs = MutableStateFlow(0L)
    val elapsedMs: StateFlow<Long> = _elapsedMs.asStateFlow()

    private val _countdown = MutableStateFlow(0)
    val countdown: StateFlow<Int> = _countdown.asStateFlow()

    private val _liveViewers = MutableStateFlow(0)
    val liveViewers: StateFlow<Int> = _liveViewers.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    internal fun setState(state: State) { _state.value = state }
    internal fun setElapsed(ms: Long) { _elapsedMs.value = ms }
    internal fun setCountdown(value: Int) { _countdown.value = value }
    internal fun setLiveViewers(count: Int) { _liveViewers.value = count }
    fun setError(message: String?) { _error.value = message }

    val isActive: Boolean
        get() = _state.value == State.RECORDING || _state.value == State.PAUSED || _state.value == State.COUNTDOWN
}
