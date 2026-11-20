package com.madix.registration.data

/** Normalizes a user-entered server address into a full base URL. */
object ServerUrl {
    private val ipv4 = Regex("""^\d{1,3}(\.\d{1,3}){3}(:\d+)?$""")

    fun normalize(input: String): String {
        val t = input.trim()
        if (t.isEmpty()) return ""
        if (t.startsWith("http://") || t.startsWith("https://")) {
            return t.trimEnd('/')
        }
        // Bare IP (optionally with port) or a host:port tends to be a plain-HTTP
        // server; a hostname without a port is assumed to use HTTPS.
        val scheme = if (ipv4.matches(t) || (t.contains(":") && !t.contains("."))) "http" else "https"
        return "$scheme://$t".trimEnd('/')
    }

    fun toWs(base: String): String = when {
        base.startsWith("https://") -> "wss://" + base.removePrefix("https://")
        base.startsWith("http://") -> "ws://" + base.removePrefix("http://")
        else -> base
    }
}
