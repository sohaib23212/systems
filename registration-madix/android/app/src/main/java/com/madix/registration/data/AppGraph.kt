package com.madix.registration.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient

/** Simple service locator built once in [com.madix.registration.App]. */
class AppGraph(val appContext: Context) {

    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val prefs = Prefs(appContext)
    val tokens = TokenHolder()

    private val _session = MutableStateFlow(
        Session(serverUrl = "", accessToken = "", refreshToken = "", userId = "", username = "")
    )
    val session: StateFlow<Session> = _session.asStateFlow()

    private val _settings = MutableStateFlow(RecordSettings())
    val settings: StateFlow<RecordSettings> = _settings.asStateFlow()

    val okHttp: OkHttpClient = NetworkFactory.okHttp(
        tokens = tokens,
        onRefreshed = { access, refresh ->
            tokens.accessToken = access
            tokens.refreshToken = refresh
            scope.launch { prefs.saveTokens(access, refresh) }
        },
        onFailed = {
            scope.launch { prefs.clearSession() }
        },
    )

    val api: MadixApi = NetworkFactory.retrofit(okHttp).create(MadixApi::class.java)

    val authRepo = AuthRepository(this)
    val deviceRepo = DeviceRepository(this)
    val recordingRepo = RecordingRepository(this)

    @Volatile var installId: String = ""

    init {
        scope.launch {
            prefs.sessionFlow.collect { s ->
                tokens.serverUrl = s.serverUrl
                tokens.accessToken = s.accessToken
                tokens.refreshToken = s.refreshToken
                _session.value = s
            }
        }
        scope.launch {
            prefs.settingsFlow.collect { _settings.value = it }
        }
        scope.launch {
            installId = prefs.installId()
        }
    }

    /** Base server URL normalized with scheme, used for raw streaming calls and WebSocket. */
    fun serverBase(): String {
        val url = tokens.serverUrl.trim()
        if (url.isEmpty()) return ""
        val withScheme = if (url.startsWith("http://") || url.startsWith("https://")) url else "https://$url"
        return withScheme.trimEnd('/')
    }

    fun wsBase(): String {
        val base = serverBase()
        return when {
            base.startsWith("https://") -> "wss://" + base.removePrefix("https://")
            base.startsWith("http://") -> "ws://" + base.removePrefix("http://")
            else -> base
        }
    }
}
