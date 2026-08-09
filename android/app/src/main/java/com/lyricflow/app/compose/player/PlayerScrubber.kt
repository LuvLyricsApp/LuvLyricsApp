package com.lyricflow.app.compose.player

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min

/**
 * Compose port of src/components/TimelineScrubber.tsx.
 *
 * Two behaviours here are load-bearing and must survive any refactor:
 *
 *  1. **A drag is a preview.** The player is never touched until the finger
 *     lifts. Seeking on every drag frame thrashes Media3 and makes the thumb
 *     fight the position updates.
 *  2. **The settle window.** After a commit, the scrubber keeps showing the
 *     committed position for 200 ms. Media3 reports the *old* position for a
 *     frame or two after `seekTo`, and without this the thumb visibly snaps
 *     back before jumping forward again.
 */

private const val MORPH_IN_MS = 150
private const val MORPH_OUT_MS = 170
private val MORPH_EASE = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)
private const val SETTLE_MS = 200L

private val TRACK_HEIGHT_IDLE = 3.5.dp
private val TRACK_HEIGHT_ACTIVE = 6.dp

@Composable
fun PlayerScrubber(
    positionSec: Double,
    durationSec: Double,
    onSeek: (Double) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    hitHeight: androidx.compose.ui.unit.Dp = PlayerTokens.ClassicScrubberHitHeight,
    onScrubStart: () -> Unit = {},
    onScrubEnd: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    val morph = remember { Animatable(0f) }

    var trackWidth by remember { mutableFloatStateOf(0f) }
    var isScrubbing by remember { mutableStateOf(false) }
    val dragProgress = remember { mutableFloatStateOf(0f) }
    var settleUntil by remember { mutableLongStateOf(0L) }
    var settling by remember { mutableStateOf(false) }

    val latestOnSeek by rememberUpdatedState(onSeek)
    val latestDuration by rememberUpdatedState(durationSec)

    val playerProgress = if (durationSec > 0) {
        (positionSec / durationSec).toFloat().coerceIn(0f, 1f)
    } else {
        0f
    }

    // Clears the settle window once it expires so the track resumes following
    // the player clock.
    LaunchedEffect(settleUntil) {
        if (settleUntil == 0L) return@LaunchedEffect
        settling = true
        delay(SETTLE_MS)
        settling = false
    }

    fun commit(progress: Float) {
        val duration = latestDuration
        if (duration > 0) latestOnSeek(progress * duration)
        settleUntil = System.currentTimeMillis()
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(hitHeight)
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                detectTapGestures { offset ->
                    if (trackWidth <= 0f) return@detectTapGestures
                    val progress = (offset.x / trackWidth).coerceIn(0f, 1f)
                    dragProgress.floatValue = progress
                    // Tap is an instant jump. One sequence — a morphIn() then
                    // morphOut() in the same frame just cancels the first, so
                    // nothing pulsed at all.
                    scope.launch {
                        morph.animateTo(1f, tween(MORPH_IN_MS, easing = MORPH_EASE))
                        morph.animateTo(0f, tween(MORPH_OUT_MS, easing = MORPH_EASE))
                    }
                    commit(progress)
                }
            }
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                detectHorizontalDragGestures(
                    onDragStart = { offset ->
                        isScrubbing = true
                        dragProgress.floatValue = if (trackWidth > 0f) {
                            (offset.x / trackWidth).coerceIn(0f, 1f)
                        } else {
                            playerProgress
                        }
                        scope.launch { morph.animateTo(1f, tween(MORPH_IN_MS, easing = MORPH_EASE)) }
                        onScrubStart()
                    },
                    onDragEnd = {
                        val finalProgress = dragProgress.floatValue
                        isScrubbing = false
                        scope.launch { morph.animateTo(0f, tween(MORPH_OUT_MS, easing = MORPH_EASE)) }
                        commit(finalProgress)
                        onScrubEnd()
                    },
                    onDragCancel = {
                        // Interrupted mid-drag: abandon the scrub and leave audio
                        // where it was.
                        isScrubbing = false
                        scope.launch { morph.animateTo(0f, tween(MORPH_OUT_MS, easing = MORPH_EASE)) }
                        onScrubEnd()
                    },
                    onHorizontalDrag = { change, _ ->
                        change.consume()
                        // UI-only preview — do not touch the player until release.
                        if (trackWidth > 0f) {
                            dragProgress.floatValue =
                                (change.position.x / trackWidth).coerceIn(0f, 1f)
                        }
                    },
                )
            }
            .drawBehind {
                trackWidth = size.width
                val morphValue = morph.value
                val trackHeight = androidx.compose.ui.util.lerp(
                    TRACK_HEIGHT_IDLE.toPx(),
                    TRACK_HEIGHT_ACTIVE.toPx(),
                    morphValue,
                )
                val radius = trackHeight / 2f
                // The track paints from the wrapper's top edge downward; the rest
                // of the hit height exists only to catch the thumb.
                val top = 0f

                val progress = if (isScrubbing || settling) {
                    dragProgress.floatValue
                } else {
                    playerProgress
                }

                drawRoundRect(
                    color = PlayerTokens.ScrubberTrackColor,
                    topLeft = Offset(0f, top),
                    size = Size(size.width, trackHeight),
                    cornerRadius = CornerRadius(radius, radius),
                )

                val fillWidth = size.width * progress.coerceIn(0f, 1f)
                if (fillWidth > 0f) {
                    drawRoundRect(
                        color = PlayerTokens.ScrubberFillColor,
                        topLeft = Offset(0f, top),
                        size = Size(fillWidth, trackHeight),
                        cornerRadius = CornerRadius(radius, radius),
                    )
                }

                // Glow under the fill while scrubbing.
                val glowAlpha = when {
                    morphValue <= 0f -> 0f
                    morphValue <= 0.4f -> androidx.compose.ui.util.lerp(0f, 0.35f, morphValue / 0.4f)
                    else -> androidx.compose.ui.util.lerp(0.35f, 0.5f, (morphValue - 0.4f) / 0.6f)
                }
                if (glowAlpha > 0f && fillWidth > 0f) {
                    val glowHeight = trackHeight * androidx.compose.ui.util.lerp(0.6f, 1f, morphValue)
                    drawRoundRect(
                        color = Color.White.copy(alpha = glowAlpha),
                        topLeft = Offset(0f, top + (trackHeight - glowHeight) / 2f),
                        size = Size(fillWidth, glowHeight),
                        cornerRadius = CornerRadius(radius, radius),
                    )
                }

                // Thumb, only while the scrubber is engaged.
                if (morphValue > 0.01f) {
                    val dotRadius = PlayerTokens.ScrubberDotSize.toPx() / 2f * morphValue
                    drawCircle(
                        color = Color.White,
                        radius = dotRadius,
                        center = Offset(fillWidth, top + trackHeight / 2f),
                    )
                }
            }
    )
}

/** m:ss, matching the RN label format. */
fun formatPlayerTime(seconds: Double): String {
    if (seconds.isNaN() || seconds < 0) return "0:00"
    val total = seconds.toInt()
    val minutes = total / 60
    val secs = total % 60
    return "$minutes:${secs.toString().padStart(2, '0')}"
}

private fun clamp01(value: Float) = max(0f, min(1f, value))
