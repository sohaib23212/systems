package com.madix.registration.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class User(
    val id: String,
    val username: String,
    val createdAt: String? = null,
)

@Serializable
data class AuthResponse(
    val user: User,
    val accessToken: String,
    val refreshToken: String,
)

@Serializable
data class AuthRequest(
    val username: String,
    val password: String,
)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class UserEnvelope(val user: User)

@Serializable
data class Device(
    val id: String,
    val name: String,
    val model: String = "",
    val platform: String = "android",
    val osVersion: String = "",
    val lastSeen: String? = null,
    val createdAt: String? = null,
    val online: Boolean = false,
    val isRecording: Boolean = false,
    val canLive: Boolean = false,
)

@Serializable
data class DeviceEnvelope(val device: Device)

@Serializable
data class DevicesEnvelope(val devices: List<Device>)

@Serializable
data class DeviceRegisterRequest(
    val installId: String,
    val name: String,
    val model: String,
    val platform: String = "android",
    val osVersion: String,
    val canLive: Boolean,
)

@Serializable
data class DeviceRenameRequest(val name: String)

@Serializable
data class Recording(
    val id: String,
    val deviceId: String? = null,
    val deviceName: String = "",
    val title: String = "",
    val mime: String = "video/mp4",
    val sizeBytes: Long = 0,
    val durationMs: Long = 0,
    val width: Int = 0,
    val height: Int = 0,
    val hasAudio: Boolean = false,
    val encrypted: Boolean = false,
    val status: String = "pending",
    val hasThumb: Boolean = false,
    val createdAt: String? = null,
)

@Serializable
data class RecordingEnvelope(val recording: Recording)

@Serializable
data class RecordingsEnvelope(val recordings: List<Recording>)

@Serializable
data class RecordingCreateRequest(
    val deviceId: String? = null,
    val deviceName: String = "",
    val title: String = "",
    val mime: String = "video/mp4",
    val durationMs: Long = 0,
    val width: Int = 0,
    val height: Int = 0,
    val hasAudio: Boolean = false,
    val encrypted: Boolean = false,
)

@Serializable
data class RecordingRenameRequest(val title: String)

@Serializable
data class IceServer(
    val urls: kotlinx.serialization.json.JsonElement? = null,
    val username: String? = null,
    val credential: String? = null,
)

@Serializable
data class OkResponse(val ok: Boolean = false, @SerialName("delivered") val delivered: Boolean? = null)
