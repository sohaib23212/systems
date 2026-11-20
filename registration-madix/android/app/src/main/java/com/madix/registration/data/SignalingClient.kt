package com.madix.registration.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

data class LiveDevice(
    val deviceId: String,
    val online: Boolean,
    val isRecording: Boolean,
    val canLive: Boolean = false,
)

sealed class SignalEvent {
    data object Connected : SignalEvent()
    data object Disconnected : SignalEvent()
    data class DeviceUpdate(val device: LiveDevice) : SignalEvent()
    data class Devices(val devices: List<LiveDevice>) : SignalEvent()
    data object LiveStart : SignalEvent()
    data object LiveStop : SignalEvent()
    data class Command(val command: String) : SignalEvent()
    data class LiveReady(val deviceId: String) : SignalEvent()
    data class LiveError(val deviceId: String, val reason: String) : SignalEvent()
    data object LiveEnded : SignalEvent()
    data class Frame(val bytes: ByteArray) : SignalEvent()
}

enum class SignalRole { DEVICE, VIEWER }

class SignalingClient(
    private val graph: AppGraph,
    private val role: SignalRole,
    private val deviceId: String? = null,
    private val canLive: Boolean = false,
) {
    private val client: OkHttpClient = graph.okHttp
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var ws: WebSocket? = null
    private val active = AtomicBoolean(false)
    private var reconnectDelay = 1000L

    private val _events = MutableSharedFlow<SignalEvent>(
        extraBufferCapacity = 256,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val events: SharedFlow<SignalEvent> = _events.asSharedFlow()

    fun connect() {
        if (active.getAndSet(true)) return
        openSocket()
    }

    private fun openSocket() {
        val token = graph.tokens.accessToken
        val base = graph.wsBase()
        if (token.isEmpty() || base.isEmpty()) {
            scheduleReconnect()
            return
        }
        val req = Request.Builder().url("$base/ws?token=$token").build()
        ws = client.newWebSocket(req, listener)
    }

    private val listener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            reconnectDelay = 1000L
            val hello = JSONObject().put("type", "hello").put("role", if (role == SignalRole.DEVICE) "device" else "viewer")
            if (role == SignalRole.DEVICE && deviceId != null) {
                hello.put("deviceId", deviceId).put("canLive", canLive)
            }
            webSocket.send(hello.toString())
            if (role == SignalRole.VIEWER) {
                webSocket.send(JSONObject().put("type", "devices").toString())
            }
            emit(SignalEvent.Connected)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            handleText(text)
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            emit(SignalEvent.Frame(bytes.toByteArray()))
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(1000, null)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            emit(SignalEvent.Disconnected)
            scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            emit(SignalEvent.Disconnected)
            scheduleReconnect()
        }
    }

    private fun handleText(text: String) {
        val obj = runCatching { JSONObject(text) }.getOrNull() ?: return
        when (obj.optString("type")) {
            "device-update" -> parseDevice(obj.optJSONObject("device"))?.let {
                emit(SignalEvent.DeviceUpdate(it))
            }
            "devices" -> {
                val arr = obj.optJSONArray("devices") ?: JSONArray()
                val list = ArrayList<LiveDevice>()
                for (i in 0 until arr.length()) parseDevice(arr.optJSONObject(i))?.let { list.add(it) }
                emit(SignalEvent.Devices(list))
            }
            "live-start" -> emit(SignalEvent.LiveStart)
            "live-stop" -> emit(SignalEvent.LiveStop)
            "command" -> emit(SignalEvent.Command(obj.optString("command")))
            "live-ready" -> emit(SignalEvent.LiveReady(obj.optString("deviceId")))
            "live-error" -> emit(SignalEvent.LiveError(obj.optString("deviceId"), obj.optString("reason")))
            "live-ended" -> emit(SignalEvent.LiveEnded)
        }
    }

    private fun parseDevice(o: JSONObject?): LiveDevice? {
        o ?: return null
        val id = o.optString("deviceId")
        if (id.isEmpty()) return null
        return LiveDevice(
            deviceId = id,
            online = o.optBoolean("online", false),
            isRecording = o.optBoolean("isRecording", false),
            canLive = o.optBoolean("canLive", false),
        )
    }

    private fun emit(event: SignalEvent) {
        scope.launch { _events.emit(event) }
    }

    private fun scheduleReconnect() {
        if (!active.get()) return
        scope.launch {
            kotlinx.coroutines.delay(reconnectDelay)
            reconnectDelay = (reconnectDelay * 2).coerceAtMost(15000L)
            if (active.get()) openSocket()
        }
    }

    fun sendPresence(isRecording: Boolean) {
        ws?.send(JSONObject().put("type", "presence").put("isRecording", isRecording).toString())
    }

    fun requestLive(deviceId: String, fps: Int, maxWidth: Int) {
        ws?.send(
            JSONObject().put("type", "live-request").put("deviceId", deviceId)
                .put("fps", fps).put("maxWidth", maxWidth).toString()
        )
    }

    fun stopLive(deviceId: String) {
        ws?.send(JSONObject().put("type", "live-stop").put("deviceId", deviceId).toString())
    }

    fun sendCommand(deviceId: String, command: String) {
        ws?.send(JSONObject().put("type", "command").put("deviceId", deviceId).put("command", command).toString())
    }

    fun sendFrame(bytes: ByteArray) {
        ws?.send(bytes.toByteString(0, bytes.size))
    }

    fun refreshDevices() {
        ws?.send(JSONObject().put("type", "devices").toString())
    }

    fun close() {
        active.set(false)
        ws?.close(1000, null)
        ws = null
    }
}
