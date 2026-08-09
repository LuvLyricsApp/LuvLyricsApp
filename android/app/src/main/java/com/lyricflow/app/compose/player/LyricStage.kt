package com.lyricflow.app.compose.player

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/**
 * The lyric stage, shared by the half/full classic bar and the expanded island.
 *
 * Two rules from CLAUDE.md are deliberately encoded here and must not be
 * "improved":
 *
 *  · **No active-text scaling.** Every line renders in one face at one size;
 *    the active line is carried by colour and opacity alone. Swapping to a bold
 *    face or scaling up made the current line read as physically larger than
 *    its neighbours and the whole block jitter as it re-measured.
 *  · **Centred follow.** The active line is scrolled to the middle of the
 *    stage, not the top.
 *
 * Rendering is chosen by what the song actually has: word-timed lines get a
 * per-word sweep, line-synced get a per-line highlight, plain lyrics still
 * auto-scroll on the evenly-spread timestamps the parser assigns.
 */

// Effective alphas, matching src/components/SynchronizedLyrics.tsx where the RN
// styles multiply a colour alpha by a separate opacity.
private const val ALPHA_INACTIVE_PAST = 0.225f      // 0.5 × 0.45
private const val ALPHA_INACTIVE_UPCOMING = 0.14f   // 0.5 × 0.28
private const val ALPHA_WORD_SUNG = 0.72f
private const val ALPHA_WORD_CURRENT = 1.0f
private const val ALPHA_WORD_LEAD_IN = 0.3025f      // 0.55 × 0.55
private const val ALPHA_WORD_UPCOMING = 0.1444f     // 0.38 × 0.38

@Composable
fun LyricStage(
    lyrics: SongLyrics,
    positionSec: Double,
    fontSize: TextUnit,
    modifier: Modifier = Modifier,
    /** Global lyrics delay from settings; the per-song offset is added on top. */
    globalDelaySec: Double = 0.0,
    onSeekToLine: (Double) -> Unit = {},
    contentPadding: PaddingValues = PaddingValues(horizontal = 32.dp, vertical = 24.dp),
) {
    if (lyrics.isEmpty) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = "No lyrics for this track",
                color = Color.White.copy(alpha = 0.45f),
                style = TextStyle(fontSize = fontSize, textAlign = TextAlign.Center),
            )
        }
        return
    }

    val offset = lyrics.offset + globalDelaySec
    val activeIndex = remember(lyrics, positionSec, offset) {
        lyrics.lines.activeLineIndex(positionSec, offset)
    }
    val listState = rememberLazyListState()

    BoxWithConstraints(modifier = modifier) {
        val viewportPx = with(androidx.compose.ui.platform.LocalDensity.current) {
            maxHeight.toPx()
        }

        // Centred follow: place the active line in the middle of the stage
        // rather than at its top edge.
        LaunchedEffect(activeIndex, viewportPx) {
            if (activeIndex < 0) return@LaunchedEffect
            val itemHeight = listState.layoutInfo.visibleItemsInfo
                .firstOrNull { it.index == activeIndex }?.size
                ?: listState.layoutInfo.visibleItemsInfo.firstOrNull()?.size
                ?: 0
            val centreOffset = -((viewportPx - itemHeight) / 2f).roundToInt()
            listState.animateScrollToItem(activeIndex, centreOffset)
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = contentPadding,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            items(
                count = lyrics.lines.size,
                key = { index ->
                    val line = lyrics.lines[index]
                    "${line.lineOrder}-${line.timestamp}"
                },
            ) { index ->
                val line = lyrics.lines[index]
                LyricRow(
                    line = line,
                    index = index,
                    activeIndex = activeIndex,
                    positionSec = positionSec,
                    offset = offset,
                    fontSize = fontSize,
                    onClick = { onSeekToLine(line.timestamp) },
                )
            }
        }
    }
}

@Composable
private fun LyricRow(
    line: LyricLine,
    index: Int,
    activeIndex: Int,
    positionSec: Double,
    offset: Double,
    fontSize: TextUnit,
    onClick: () -> Unit,
) {
    val isActive = index == activeIndex
    val isPast = index < activeIndex

    val baseStyle = TextStyle(
        fontSize = fontSize,
        textAlign = TextAlign.Center,
        lineHeight = fontSize * 1.32f,
    )

    val modifier = Modifier
        .fillMaxWidth()
        .clickable(onClick = onClick)
        .padding(vertical = 2.dp)

    // Background-vocal lines from TTML sit quieter than the lead.
    val backgroundDamp = if (line.isBackground) 0.72f else 1f

    if (isActive && line.words.isNotEmpty()) {
        // Word-timed sweep across the active line.
        val text = buildAnnotatedString {
            line.words.forEachIndexed { wordIndex, word ->
                val end = if (word.endTime > word.startTime) word.endTime else word.startTime + 0.35
                val t = positionSec + offset
                val alpha = when {
                    t >= end -> ALPHA_WORD_SUNG
                    t >= word.startTime -> ALPHA_WORD_CURRENT
                    wordIndex == 0 -> ALPHA_WORD_LEAD_IN
                    else -> ALPHA_WORD_UPCOMING
                }
                withStyle(SpanStyle(color = Color.White.copy(alpha = alpha * backgroundDamp))) {
                    append(word.text)
                    if (wordIndex != line.words.lastIndex) append(" ")
                }
            }
        }
        Text(text = text, style = baseStyle, modifier = modifier)
        return
    }

    val targetAlpha = when {
        isActive -> ALPHA_WORD_CURRENT
        isPast -> ALPHA_INACTIVE_PAST
        else -> ALPHA_INACTIVE_UPCOMING
    } * backgroundDamp

    // Colour-only transition — never size or weight.
    val alpha by animateFloatAsState(
        targetValue = targetAlpha,
        animationSpec = tween(220),
        label = "lyric-alpha",
    )

    Text(
        text = line.text,
        style = baseStyle,
        color = Color.White,
        modifier = modifier.alpha(alpha),
    )
}
