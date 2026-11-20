package com.madix.registration.data

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/** Holds the live auth state used by the OkHttp interceptors. */
class TokenHolder {
    @Volatile var serverUrl: String = ""
    @Volatile var accessToken: String = ""
    @Volatile var refreshToken: String = ""
}

val MadixJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

/** Rewrites the placeholder host of each request with the user-configured server URL. */
class HostSelectionInterceptor(private val tokens: TokenHolder) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val configured = tokens.serverUrl.trim()
        val base = normalize(configured)?.toHttpUrlOrNull()
            ?: return chain.proceed(request)
        val newUrl: HttpUrl = request.url.newBuilder()
            .scheme(base.scheme)
            .host(base.host)
            .port(base.port)
            .build()
        return chain.proceed(request.newBuilder().url(newUrl).build())
    }

    private fun normalize(url: String): String? {
        if (url.isEmpty()) return null
        val withScheme = if (url.startsWith("http://") || url.startsWith("https://")) url else "https://$url"
        return withScheme.trimEnd('/')
    }
}

/** Adds the bearer token to every request except the auth endpoints. */
class AuthInterceptor(private val tokens: TokenHolder) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val path = request.url.encodedPath
        val skip = path.endsWith("/auth/login") ||
            path.endsWith("/auth/register") ||
            path.endsWith("/auth/refresh")
        if (skip || tokens.accessToken.isEmpty()) return chain.proceed(request)
        val authed = request.newBuilder()
            .header("Authorization", "Bearer ${tokens.accessToken}")
            .build()
        return chain.proceed(authed)
    }
}

/** On 401, refreshes the access token once and retries. */
class TokenAuthenticator(
    private val tokens: TokenHolder,
    private val onRefreshed: (access: String, refresh: String) -> Unit,
    private val onFailed: () -> Unit,
) : okhttp3.Authenticator {

    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.header("Authorization") == null) return null
        if (responseCount(response) >= 2) return null
        val current = tokens.refreshToken
        if (current.isEmpty()) return null

        synchronized(lock) {
            // Another thread may have refreshed already.
            val latest = tokens.accessToken
            val failedToken = response.request.header("Authorization")?.removePrefix("Bearer ")
            if (latest.isNotEmpty() && latest != failedToken) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer $latest")
                    .build()
            }
            val refreshed = refreshBlocking(tokens.serverUrl, current)
            if (refreshed == null) {
                onFailed()
                return null
            }
            onRefreshed(refreshed.accessToken, refreshed.refreshToken)
            return response.request.newBuilder()
                .header("Authorization", "Bearer ${refreshed.accessToken}")
                .build()
        }
    }

    private fun refreshBlocking(serverUrl: String, refreshToken: String): AuthResponse? {
        return try {
            val base = (if (serverUrl.startsWith("http")) serverUrl else "https://$serverUrl").trimEnd('/')
            val client = OkHttpClient()
            val body = MadixJson.encodeToString(RefreshRequest.serializer(), RefreshRequest(refreshToken))
            val req = Request.Builder()
                .url("$base/api/auth/refresh")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return null
                val text = resp.body?.string() ?: return null
                MadixJson.decodeFromString(AuthResponse.serializer(), text)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}

object NetworkFactory {
    fun okHttp(tokens: TokenHolder, onRefreshed: (String, String) -> Unit, onFailed: () -> Unit): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(HostSelectionInterceptor(tokens))
            .addInterceptor(AuthInterceptor(tokens))
            .authenticator(TokenAuthenticator(tokens, onRefreshed, onFailed))
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(5, TimeUnit.MINUTES)
            .build()
    }

    fun retrofit(client: OkHttpClient): Retrofit {
        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl("http://server.invalid/")
            .client(client)
            .addConverterFactory(MadixJson.asConverterFactory(contentType))
            .build()
    }
}
