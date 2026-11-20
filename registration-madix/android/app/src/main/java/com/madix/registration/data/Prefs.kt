package com.madix.registration.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "madix_prefs")

data class Session(
    val serverUrl: String,
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    val username: String,
) {
    val isLoggedIn: Boolean get() = accessToken.isNotEmpty() && userId.isNotEmpty()
}

data class RecordSettings(
    val resolutionPercent: Int = 100,   // 50..100 of native, or fixed heights
    val fps: Int = 30,
    val bitrateMbps: Int = 12,
    val audioMode: String = "mic",      // none | mic | internal | both
    val facecam: Boolean = false,
    val facecamFront: Boolean = true,
    val countdownSeconds: Int = 3,
    val stopOnLowBattery: Boolean = true,
    val encrypt: Boolean = false,
    val autoUpload: Boolean = true,
    val uploadOnWifiOnly: Boolean = false,
    val appLock: Boolean = false,
    val liveFps: Int = 5,
    val liveMaxWidth: Int = 480,
)

class Prefs(private val context: Context) {

    private object Keys {
        val serverUrl = stringPreferencesKey("server_url")
        val accessToken = stringPreferencesKey("access_token")
        val refreshToken = stringPreferencesKey("refresh_token")
        val userId = stringPreferencesKey("user_id")
        val username = stringPreferencesKey("username")
        val installId = stringPreferencesKey("install_id")

        val resolutionPercent = intPreferencesKey("res_percent")
        val fps = intPreferencesKey("fps")
        val bitrate = intPreferencesKey("bitrate")
        val audioMode = stringPreferencesKey("audio_mode")
        val facecam = booleanPreferencesKey("facecam")
        val facecamFront = booleanPreferencesKey("facecam_front")
        val countdown = intPreferencesKey("countdown")
        val stopOnLowBattery = booleanPreferencesKey("stop_low_batt")
        val encrypt = booleanPreferencesKey("encrypt")
        val autoUpload = booleanPreferencesKey("auto_upload")
        val wifiOnly = booleanPreferencesKey("wifi_only")
        val appLock = booleanPreferencesKey("app_lock")
        val liveFps = intPreferencesKey("live_fps")
        val liveMaxWidth = intPreferencesKey("live_max_width")
    }

    val sessionFlow: Flow<Session> = context.dataStore.data.map { p ->
        Session(
            serverUrl = p[Keys.serverUrl] ?: "",
            accessToken = p[Keys.accessToken] ?: "",
            refreshToken = p[Keys.refreshToken] ?: "",
            userId = p[Keys.userId] ?: "",
            username = p[Keys.username] ?: "",
        )
    }

    val settingsFlow: Flow<RecordSettings> = context.dataStore.data.map { p ->
        RecordSettings(
            resolutionPercent = p[Keys.resolutionPercent] ?: 100,
            fps = p[Keys.fps] ?: 30,
            bitrateMbps = p[Keys.bitrate] ?: 12,
            audioMode = p[Keys.audioMode] ?: "mic",
            facecam = p[Keys.facecam] ?: false,
            facecamFront = p[Keys.facecamFront] ?: true,
            countdownSeconds = p[Keys.countdown] ?: 3,
            stopOnLowBattery = p[Keys.stopOnLowBattery] ?: true,
            encrypt = p[Keys.encrypt] ?: false,
            autoUpload = p[Keys.autoUpload] ?: true,
            uploadOnWifiOnly = p[Keys.wifiOnly] ?: false,
            appLock = p[Keys.appLock] ?: false,
            liveFps = p[Keys.liveFps] ?: 5,
            liveMaxWidth = p[Keys.liveMaxWidth] ?: 480,
        )
    }

    suspend fun saveSession(session: Session) {
        context.dataStore.edit { p ->
            p[Keys.serverUrl] = session.serverUrl
            p[Keys.accessToken] = session.accessToken
            p[Keys.refreshToken] = session.refreshToken
            p[Keys.userId] = session.userId
            p[Keys.username] = session.username
        }
    }

    suspend fun saveTokens(accessToken: String, refreshToken: String) {
        context.dataStore.edit { p ->
            p[Keys.accessToken] = accessToken
            p[Keys.refreshToken] = refreshToken
        }
    }

    suspend fun setServerUrl(url: String) {
        context.dataStore.edit { it[Keys.serverUrl] = url }
    }

    suspend fun clearSession() {
        context.dataStore.edit { p ->
            p.remove(Keys.accessToken)
            p.remove(Keys.refreshToken)
            p.remove(Keys.userId)
            p.remove(Keys.username)
        }
    }

    suspend fun updateSettings(transform: (RecordSettings) -> RecordSettings) {
        context.dataStore.edit { p ->
            val current = RecordSettings(
                resolutionPercent = p[Keys.resolutionPercent] ?: 100,
                fps = p[Keys.fps] ?: 30,
                bitrateMbps = p[Keys.bitrate] ?: 12,
                audioMode = p[Keys.audioMode] ?: "mic",
                facecam = p[Keys.facecam] ?: false,
                facecamFront = p[Keys.facecamFront] ?: true,
                countdownSeconds = p[Keys.countdown] ?: 3,
                stopOnLowBattery = p[Keys.stopOnLowBattery] ?: true,
                encrypt = p[Keys.encrypt] ?: false,
                autoUpload = p[Keys.autoUpload] ?: true,
                uploadOnWifiOnly = p[Keys.wifiOnly] ?: false,
                appLock = p[Keys.appLock] ?: false,
                liveFps = p[Keys.liveFps] ?: 5,
                liveMaxWidth = p[Keys.liveMaxWidth] ?: 480,
            )
            val next = transform(current)
            p[Keys.resolutionPercent] = next.resolutionPercent
            p[Keys.fps] = next.fps
            p[Keys.bitrate] = next.bitrateMbps
            p[Keys.audioMode] = next.audioMode
            p[Keys.facecam] = next.facecam
            p[Keys.facecamFront] = next.facecamFront
            p[Keys.countdown] = next.countdownSeconds
            p[Keys.stopOnLowBattery] = next.stopOnLowBattery
            p[Keys.encrypt] = next.encrypt
            p[Keys.autoUpload] = next.autoUpload
            p[Keys.wifiOnly] = next.uploadOnWifiOnly
            p[Keys.appLock] = next.appLock
            p[Keys.liveFps] = next.liveFps
            p[Keys.liveMaxWidth] = next.liveMaxWidth
        }
    }

    suspend fun installId(): String {
        var id: String? = null
        context.dataStore.edit { p ->
            id = p[Keys.installId]
            if (id == null) {
                id = UUID.randomUUID().toString()
                p[Keys.installId] = id!!
            }
        }
        return id!!
    }
}
