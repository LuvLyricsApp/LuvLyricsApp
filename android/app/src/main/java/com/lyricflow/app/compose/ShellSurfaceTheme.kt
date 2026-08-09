package com.lyricflow.app.compose

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * LuvLyrics palette, ported from src/constants/colors.ts.
 *
 * The accent is **monochrome on purpose** (Vercel-style): white on dark, black
 * on light. The previous navy/teal surfaces were removed from the RN app
 * because they leaked a blue cast into every screen through useThemeColors();
 * do not reintroduce a coloured primary here.
 *
 * Background is true black — not a dark grey — so the solid-black tab bar and
 * the bottom of the player pill meet the page without a visible seam.
 */

/** Named tokens that have no Material3 slot but are used across screens. */
object LuvColors {
    val LyricHighlight = Color(0xFF7ED957)
    val LyricHighlightSoft = Color(0xFFA7E86F)
    val TextMuted = Color(0xFF6E6E6E)
    val Divider = Color(0xFF1F1F1F)
    val CardHover = Color(0xFF1A1A1A)
    val Warning = Color(0xFFFF9500)
    /** Liked / success green used by the player's like control. */
    val Success = Color(0xFF7ED957)
    val ArtworkPlaceholder = Color(0xFF2A2A2A)
}

private val DarkShellColors = darkColorScheme(
    primary = Color(0xFFFFFFFF),
    onPrimary = Color(0xFF000000),
    secondary = Color(0xFFA1A1A1),
    onSecondary = Color(0xFF000000),
    tertiary = Color(0xFF7ED957),
    background = Color(0xFF000000),
    onBackground = Color(0xFFEDEDED),
    surface = Color(0xFF0A0A0A),
    onSurface = Color(0xFFEDEDED),
    surfaceVariant = Color(0xFF1A1A1A),
    onSurfaceVariant = Color(0xFFA1A1A1),
    outline = Color(0xFF262626),
    outlineVariant = Color(0xFF1F1F1F),
    error = Color(0xFFFF3B30),
)

private val LightShellColors = lightColorScheme(
    primary = Color(0xFF000000),
    onPrimary = Color(0xFFFFFFFF),
    secondary = Color(0xFF666666),
    onSecondary = Color(0xFFFFFFFF),
    tertiary = Color(0xFF1DB954),
    background = Color(0xFFF2F2F7),
    onBackground = Color(0xFF1A1A1A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF1A1A1A),
    surfaceVariant = Color(0xFFEBEBF0),
    onSurfaceVariant = Color(0xFF6B6B6B),
    outline = Color(0xFFE5E5EA),
    outlineVariant = Color(0xFFE5E5EA),
    error = Color(0xFFFF3B30),
)

@Composable
fun ShellSurfaceTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkShellColors else LightShellColors,
        content = content,
    )
}
