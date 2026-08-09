package com.lyricflow.app.compose.player

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.ui.Alignment
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.IntOffset
import kotlinx.coroutines.delay
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Long titles read from their first character, then make one complete leftward
 * pass. They return to the start and rest before the next pass — no distracting
 * ping-pong motion, and nothing animates at all when the title already fits.
 *
 * Port of MarqueeTitle in src/components/MiniPlayer.tsx.
 */
@Composable
fun MarqueeText(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
) {
    var viewportWidth by remember { mutableIntStateOf(0) }
    var textWidth by remember { mutableIntStateOf(0) }
    val offsetPx = remember { Animatable(0f) }
    val density = LocalDensity.current

    val overflow = max(0, textWidth - viewportWidth)

    LaunchedEffect(text, overflow) {
        offsetPx.snapTo(0f)
        if (overflow <= 1) return@LaunchedEffect

        val travelMs = max(
            PlayerTokens.TitleMarqueeMinTravelMs,
            (overflow / density.density / PlayerTokens.TitleMarqueePixelsPerSecond * 1000).roundToInt(),
        )
        while (true) {
            delay(PlayerTokens.TitleMarqueePauseMs.toLong())
            offsetPx.animateTo(
                targetValue = -overflow.toFloat(),
                animationSpec = tween(travelMs, easing = LinearEasing),
            )
            offsetPx.snapTo(0f)
        }
    }

    Box(
        modifier = modifier
            .clipToBounds()
            .onSizeChanged { viewportWidth = it.width }
    ) {
        androidx.compose.material3.Text(
            text = text,
            style = style,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier
                // Unbounded so the title can measure wider than the viewport —
                // clamped to the parent it could never overflow, and the
                // marquee would never run.
                .wrapContentWidth(Alignment.Start, unbounded = true)
                .onSizeChanged { textWidth = it.width }
                .offset { IntOffset(offsetPx.value.roundToInt(), 0) },
        )
    }
}
