package com.madix.registration.ui

import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.madix.registration.App
import com.madix.registration.data.Device
import com.madix.registration.data.SignalEvent
import com.madix.registration.data.SignalRole
import com.madix.registration.data.SignalingClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class DevicesViewModel : ViewModel() {

    private val graph = App.graph
    private val repo = graph.deviceRepo
    private var signaling: SignalingClient? = null

    private val _devices = MutableStateFlow<List<Device>>(emptyList())
    val devices: StateFlow<List<Device>> = _devices.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _liveFrame = MutableStateFlow<ImageBitmap?>(null)
    val liveFrame: StateFlow<ImageBitmap?> = _liveFrame.asStateFlow()

    private val _watching = MutableStateFlow<String?>(null)
    val watching: StateFlow<String?> = _watching.asStateFlow()

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    init {
        connectSignaling()
        refresh()
    }

    private fun connectSignaling() {
        val client = SignalingClient(graph, SignalRole.VIEWER)
        signaling = client
        viewModelScope.launch {
            client.events.collect { event ->
                when (event) {
                    is SignalEvent.Connected -> {
                        _connected.value = true
                        client.refreshDevices()
                    }
                    is SignalEvent.Disconnected -> _connected.value = false
                    is SignalEvent.DeviceUpdate -> applyLive(event.device.deviceId, event.device.online, event.device.isRecording)
                    is SignalEvent.Devices -> event.devices.forEach {
                        applyLive(it.deviceId, it.online, it.isRecording)
                    }
                    is SignalEvent.Frame -> decodeFrame(event.bytes)
                    is SignalEvent.LiveEnded -> _liveFrame.value = null
                    else -> {}
                }
            }
        }
        client.connect()
    }

    private fun applyLive(deviceId: String, online: Boolean, isRecording: Boolean) {
        _devices.value = _devices.value.map {
            if (it.id == deviceId) it.copy(online = online, isRecording = isRecording) else it
        }
    }

    private fun decodeFrame(bytes: ByteArray) {
        viewModelScope.launch(Dispatchers.Default) {
            val bmp = runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }.getOrNull()
            if (bmp != null) {
                withContext(Dispatchers.Main) { _liveFrame.value = bmp.asImageBitmap() }
            }
        }
    }

    fun refresh() {
        _loading.value = true
        viewModelScope.launch {
            repo.list().onSuccess { list ->
                _devices.value = list
            }
            _loading.value = false
        }
    }

    fun stopRemote(deviceId: String) {
        signaling?.sendCommand(deviceId, "stop")
        viewModelScope.launch { repo.stopRemote(deviceId) }
    }

    fun rename(deviceId: String, name: String) {
        viewModelScope.launch {
            repo.rename(deviceId, name).onSuccess { updated ->
                _devices.value = _devices.value.map { if (it.id == deviceId) updated else it }
            }
        }
    }

    fun delete(deviceId: String) {
        viewModelScope.launch {
            repo.delete(deviceId).onSuccess {
                _devices.value = _devices.value.filterNot { it.id == deviceId }
            }
        }
    }

    fun startLive(deviceId: String) {
        val settings = graph.settings.value
        _liveFrame.value = null
        _watching.value = deviceId
        signaling?.requestLive(deviceId, settings.liveFps, settings.liveMaxWidth)
    }

    fun stopLive() {
        _watching.value?.let { signaling?.stopLive(it) }
        _watching.value = null
        _liveFrame.value = null
    }

    override fun onCleared() {
        super.onCleared()
        stopLive()
        signaling?.close()
    }
}
