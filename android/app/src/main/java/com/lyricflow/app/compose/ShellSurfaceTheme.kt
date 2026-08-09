package com.lyricflow.app.compose

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkShellColors = darkColorScheme(
    primary = Color(0xFFFF7A59),
    secondary = Color(0xFF73E0C2),
    tertiary = Color(0xFF7BB4FF),
    background = Color(0xFF050505),
    surface = Color(0xFF101012),
    surfaceVariant = Color(0xFF18181C),
    onPrimary = Color(0xFF161616),
    onSecondary = Color(0xFF08110F),
    onBackground = Color(0xFFF5F5F7),
    onSurface = Color(0xFFF5F5F7),
    onSurfaceVariant = Color(0xFFD5D5DB),
)

private val LightShellColors = lightColorScheme(
    primary = Color(0xFFBF4F2F),
    secondary = Color(0xFF186F57),
    tertiary = Color(0xFF245B9E),
    background = Color(0xFFF7F4EF),
    surface = Color(0xFFFFFCF7),
    surfaceVariant = Color(0xFFF2EBE1),
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = Color(0xFF111111),
    onSurface = Color(0xFF111111),
    onSurfaceVariant = Color(0xFF4B4B4F),
)

@Composable
fun ShellSurfaceTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkShellColors else LightShellColors,
        content = content,
    )
}
