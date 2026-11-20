package com.madix.registration.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val Brand = Color(0xFFE53935)
private val BrandDark = Color(0xFFB71C1C)

private val DarkColors = darkColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    secondary = Color(0xFF4FC3F7),
    background = Color(0xFF0E1420),
    onBackground = Color(0xFFE7ECF3),
    surface = Color(0xFF151C2B),
    onSurface = Color(0xFFE7ECF3),
    surfaceVariant = Color(0xFF1E2636),
    onSurfaceVariant = Color(0xFFAEB7C6),
    error = Color(0xFFFF6B6B),
)

private val LightColors = lightColorScheme(
    primary = BrandDark,
    onPrimary = Color.White,
    secondary = Color(0xFF0277BD),
    background = Color(0xFFF6F8FB),
    onBackground = Color(0xFF14181F),
    surface = Color.White,
    onSurface = Color(0xFF14181F),
    surfaceVariant = Color(0xFFE6EAF0),
    onSurfaceVariant = Color(0xFF55606E),
    error = Color(0xFFD32F2F),
)

@Composable
fun RegistrationMadixTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colors.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }
    MaterialTheme(
        colorScheme = colors,
        typography = Typography(),
        content = content,
    )
}
