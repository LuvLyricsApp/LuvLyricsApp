package com.lyricflow.app.compose.player

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredHeight
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddCircleOutline
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import coil.compose.AsyncImage
import com.lyricflow.app.data.SongEntity
import com.lyricflow.app.player.PlaybackStatus
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The docked classic player — the sole player surface, exactly as in the RN app.
 *
 * Three stages: collapsed bar → half sheet → full sheet. Structure and every
 * tuned constant come from src/components/MiniPlayer.tsx; the notes below record
 * the reasons the RN source gives for the non-obvious choices, because each one
 * is a bug that was already fixed once.
 */
@Composable
fun ClassicPlayerBar(
    status: PlaybackStatus,
    song: SongEntity?,
    lyrics: SongLyrics,
    stage: PlayerStage,
    onStageChange: (PlayerStage) -> Unit,
    onTogglePlay: () -> Unit,
    onSkipNext: () -> Unit,
    onSkipPrevious: () -> Unit,
    onSeek: (Double) -> Unit,
    onToggleLike: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val configuration = LocalConfiguration.current
    val screenHeight = configuration.screenHeightDp.dp
    val scope = rememberCoroutineScope()

    // Worked in raw dp values so the two `lerp` overloads (Dp and Float) never
    // become ambiguous at the call sites below.
    val screenHeightF = screenHeight.value
    val halfHeightF = screenHeightF * PlayerTokens.ClassicHalfRatio
    val fullHeightF = screenHeightF * PlayerTokens.ClassicFullRatio
    val transportF = PlayerTokens.ClassicTransportHeight.value

    // Two independent clocks, mirroring the RN shared values: collapsed→half and
    // half→full. Keeping them separate is what lets the lyric block's height
    // depend on the second one only.
    val expansion = remember { Animatable(if (stage == PlayerStage.COLLAPSED) 0f else 1f) }
    val fullProgress = remember { Animatable(if (stage == PlayerStage.FULL) 1f else 0f) }

    androidx.compose.runtime.LaunchedEffect(stage) {
        val targetExpansion = if (stage == PlayerStage.COLLAPSED) 0f else 1f
        val targetFull = if (stage == PlayerStage.FULL) 1f else 0f
        launch {
            expansion.animateTo(
                targetExpansion,
                tween(PlayerTokens.IslandOpenMs, easing = PlayerTokens.IslandOpenEase),
            )
        }
        launch {
            fullProgress.animateTo(
                targetFull,
                tween(PlayerTokens.IslandOpenMs, easing = PlayerTokens.IslandOpenEase),
            )
        }
    }

    val expansionValue = expansion.value
    val fullValue = fullProgress.value

    // Shell height. Height lives on the shell (not only the content) so overflow
    // clips cleanly and the box never spills into the tab-bar strip when
    // collapsed.
    val shellHeight: Dp =
        (lerp(transportF, halfHeightF, expansionValue) + (fullHeightF - halfHeightF) * fullValue).dp

    // Rounded top corners on half/full. Whole pixels only: a rounded corner plus
    // clipping makes Android rebuild the clip path whenever the radius changes,
    // and sub-pixel radius is not visible either way.
    val halfRadius = when {
        expansionValue <= 0.35f -> lerp(0f, 16f, expansionValue / 0.35f)
        else -> lerp(16f, 28f, (expansionValue - 0.35f) / 0.65f)
    }
    val cornerRadius = (halfRadius + 6f * fullValue).roundToInt().dp

    // The lyric block's height follows ONLY fullProgress — never expansion.
    // That split is the whole point: while the bar collapses, the height is
    // constant, so the lyric subtree is never re-measured and the shell simply
    // clips it. Tying it to expansion re-measured ~60 rows every frame of the
    // collapse.
    val lyricsHeight: Dp = ((halfHeightF - transportF) +
        screenHeightF * (PlayerTokens.ClassicFullRatio - PlayerTokens.ClassicHalfRatio) * fullValue).dp

    val lyricsAlpha = ((expansionValue - 0.25f) / 0.5f).coerceIn(0f, 1f)

    // Collapsed-bar scrim. The artwork flow is capped for readability, but the
    // title/artist/controls strip sits on whatever blob happens to drift under
    // it, so the closed bar gets a guaranteed dark footing. It fades out as soon
    // as the bar opens — half/full show the lyric sheet and must stay clear.
    val scrimAlpha = (1f - expansionValue / 0.4f).coerceIn(0f, 1f)

    fun commitStage(dragUp: Boolean) {
        val next = when {
            dragUp && stage == PlayerStage.COLLAPSED -> PlayerStage.HALF
            dragUp && stage == PlayerStage.HALF -> PlayerStage.FULL
            !dragUp && stage == PlayerStage.FULL -> PlayerStage.HALF
            !dragUp && stage == PlayerStage.HALF -> PlayerStage.COLLAPSED
            else -> stage
        }
        if (next != stage) onStageChange(next)
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(shellHeight)
            .clip(RoundedCornerShape(topStart = cornerRadius, topEnd = cornerRadius))
    ) {
        ArtworkFlowBackground(
            coverUri = song?.coverImageUri,
            modifier = Modifier.fillMaxSize(),
            animated = status.isPlaying || status.playWhenReady,
        )

        if (scrimAlpha > 0f) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(PlayerTokens.ClassicTransportHeight)
                    .alpha(scrimAlpha)
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Black.copy(alpha = 0.35f), Color.Black.copy(alpha = 0.82f))
                        )
                    )
            )
        }

        // Lyric sheet. requiredHeight ignores the shell's constraint so the block
        // keeps its size while the shell animates shut and is simply clipped —
        // the alternative re-measures it every frame.
        if (lyricsAlpha > 0f) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(bottom = PlayerTokens.ClassicTransportHeight)
                    .requiredHeight(lyricsHeight)
                    .alpha(lyricsAlpha)
            ) {
                LyricStage(
                    lyrics = lyrics,
                    positionSec = status.positionSec,
                    fontSize = PlayerTokens.ExpandedLyricSize,
                    modifier = Modifier.fillMaxSize(),
                    onSeekToLine = onSeek,
                )

                // Stage-drag rails. Transparent strips down the far left and
                // right of the lyric area — stage drags start here, so the lyric
                // list owns everything between them and scrolls normally. A
                // detector around the whole column stole every vertical drag and
                // the list could never scroll at all.
                StageRail(
                    modifier = Modifier.align(Alignment.CenterStart),
                    onCommit = ::commitStage,
                )
                StageRail(
                    modifier = Modifier.align(Alignment.CenterEnd),
                    onCommit = ::commitStage,
                )
            }
        }

        // Transport row, pinned to the bottom at every stage so the controls stay
        // docked next to the nav bar and the lyrics grow upward above them.
        ClassicTransportRow(
            status = status,
            song = song,
            showSkipButtons = stage != PlayerStage.COLLAPSED,
            onTogglePlay = onTogglePlay,
            onSkipNext = onSkipNext,
            onSkipPrevious = onSkipPrevious,
            onToggleLike = onToggleLike,
            onTap = {
                if (stage == PlayerStage.COLLAPSED) onStageChange(PlayerStage.HALF)
            },
            onStageCommit = ::commitStage,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(PlayerTokens.ClassicTransportHeight),
        )

        // Scrubber sits on the transport row's top seam at every stage: bottom
        // inset + hit height together equal the transport height, so the
        // wrapper's top edge is flush with the seam and the track paints down
        // from there.
        PlayerScrubber(
            positionSec = status.positionSec,
            durationSec = status.durationSec,
            onSeek = onSeek,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(
                    bottom = PlayerTokens.ClassicTransportHeight - PlayerTokens.ClassicScrubberHitHeight
                ),
        )
    }
}

@Composable
private fun StageRail(
    modifier: Modifier,
    onCommit: (Boolean) -> Unit,
) {
    var dragged by remember { mutableStateOf(0f) }
    Box(
        modifier = modifier
            .width(PlayerTokens.ClassicStageRailWidth)
            .fillMaxHeight()
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragStart = { dragged = 0f },
                    onDragEnd = {
                        if (abs(dragged) > 24f) onCommit(dragged < 0f)
                        dragged = 0f
                    },
                ) { change, amount ->
                    change.consume()
                    dragged += amount
                }
            }
    )
}

@Composable
private fun ClassicTransportRow(
    status: PlaybackStatus,
    song: SongEntity?,
    showSkipButtons: Boolean,
    onTogglePlay: () -> Unit,
    onSkipNext: () -> Unit,
    onSkipPrevious: () -> Unit,
    onToggleLike: () -> Unit,
    onTap: () -> Unit,
    onStageCommit: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    var verticalDrag by remember { mutableStateOf(0f) }

    Row(
        modifier = modifier
            .pointerInput(Unit) {
                // Stage drag lives on the transport row, which *is* the entire
                // bar when collapsed.
                detectVerticalDragGestures(
                    onDragStart = { verticalDrag = 0f },
                    onDragEnd = {
                        if (abs(verticalDrag) > 24f) onStageCommit(verticalDrag < 0f)
                        verticalDrag = 0f
                    },
                ) { change, amount ->
                    change.consume()
                    verticalDrag += amount
                }
            }
            .padding(
                start = PlayerTokens.ClassicTransportPaddingLeft,
                end = PlayerTokens.ClassicTransportPaddingRight,
                top = PlayerTokens.ClassicTransportPaddingTop,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Track info doubles as the horizontal swipe-to-skip target.
        Row(
            modifier = Modifier
                .weight(1f)
                .pointerInput(Unit) {
                    var horizontal = 0f
                    detectHorizontalDragGestures(
                        onDragStart = { horizontal = 0f },
                        onDragEnd = {
                            if (horizontal <= -48f) onSkipNext()
                            if (horizontal >= 48f) onSkipPrevious()
                            horizontal = 0f
                        },
                    ) { change, amount ->
                        change.consume()
                        horizontal += amount
                    }
                }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onTap,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CoverThumbnail(song?.coverImageUri)
            Spacer(Modifier.width(PlayerTokens.CoverThumbnailSpacing))
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.Center,
            ) {
                MarqueeText(
                    text = status.title.ifBlank { song?.title ?: "Now playing" },
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontSize = PlayerTokens.TitleSize,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = status.artist.ifBlank {
                        song?.artist ?: if (status.isBuffering) "Buffering…" else ""
                    },
                    fontSize = PlayerTokens.ArtistSize,
                    color = PlayerTokens.ArtistColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        // Like the currently playing song without leaving the bar.
        val isLiked = song?.isLiked == true
        Box(
            modifier = Modifier
                .padding(horizontal = 8.dp)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onToggleLike,
                )
        ) {
            Icon(
                imageVector = if (isLiked) Icons.Rounded.CheckCircle else Icons.Rounded.AddCircleOutline,
                contentDescription = if (isLiked) "Liked" else "Add to liked",
                tint = if (isLiked) Color(0xFF1DB954) else Color.White,
                modifier = Modifier.size(24.dp),
            )
        }

        if (showSkipButtons) {
            TransportButton(Icons.Rounded.SkipPrevious, "Previous", onSkipPrevious)
        }
        TransportButton(
            // playWhenReady flips the moment a command is applied, unlike
            // isPlaying which stays false while buffering — so the button never
            // lags behind the user's press.
            imageVector = if (status.playWhenReady) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
            contentDescription = if (status.playWhenReady) "Pause" else "Play",
            onClick = onTogglePlay,
            size = 32.dp,
        )
        if (showSkipButtons) {
            TransportButton(Icons.Rounded.SkipNext, "Next", onSkipNext)
        }
    }
}

@Composable
private fun TransportButton(
    imageVector: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    size: Dp = 28.dp,
) {
    Icon(
        imageVector = imageVector,
        contentDescription = contentDescription,
        tint = Color.White,
        modifier = Modifier
            .padding(horizontal = 2.dp)
            .size(size)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
    )
}

@Composable
private fun CoverThumbnail(uri: String?) {
    val shape = RoundedCornerShape(PlayerTokens.CoverThumbnailRadius)
    if (uri.isNullOrBlank()) {
        Box(
            modifier = Modifier
                .size(PlayerTokens.CoverThumbnailSize)
                .clip(shape)
                .background(Color(0xFF222222)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.MusicNote,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.6f),
            )
        }
        return
    }
    AsyncImage(
        model = uri,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = Modifier
            .size(PlayerTokens.CoverThumbnailSize)
            .clip(shape),
    )
}
