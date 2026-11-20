package com.madix.registration.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AuthRepository(private val graph: AppGraph) {

    private fun normalize(url: String): String {
        val t = url.trim()
        val withScheme = if (t.startsWith("http://") || t.startsWith("https://")) t else "https://$t"
        return withScheme.trimEnd('/')
    }

    suspend fun login(serverUrl: String, username: String, password: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val base = normalize(serverUrl)
                graph.tokens.serverUrl = base
                val resp = graph.api.login(AuthRequest(username.trim(), password))
                persist(base, resp)
            }
        }

    suspend fun register(serverUrl: String, username: String, password: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val base = normalize(serverUrl)
                graph.tokens.serverUrl = base
                val resp = graph.api.register(AuthRequest(username.trim(), password))
                persist(base, resp)
            }
        }

    private suspend fun persist(base: String, resp: AuthResponse) {
        graph.tokens.serverUrl = base
        graph.tokens.accessToken = resp.accessToken
        graph.tokens.refreshToken = resp.refreshToken
        graph.prefs.saveSession(
            Session(
                serverUrl = base,
                accessToken = resp.accessToken,
                refreshToken = resp.refreshToken,
                userId = resp.user.id,
                username = resp.user.username,
            )
        )
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        runCatching {
            val refresh = graph.tokens.refreshToken
            if (refresh.isNotEmpty()) {
                runCatching { graph.api.logout(RefreshRequest(refresh)) }
            }
        }
        graph.tokens.accessToken = ""
        graph.tokens.refreshToken = ""
        graph.prefs.clearSession()
    }
}
