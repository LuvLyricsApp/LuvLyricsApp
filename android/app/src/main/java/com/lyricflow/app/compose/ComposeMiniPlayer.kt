package com.lyricflow.app.compose

import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.lyricflow.app.player.NativePlaybackController
import com.lyricflow.app.player.PlaybackStatus

/**
 * Docked classic mini-player — Phase 2.
 * Dark glass bar matching RN classic bar; Media3 via [NativePlaybackController].
 */
@Composable
fun ComposeMiniPlayer(
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val status by NativePlaybackController.status.collectAsStateWithLifecycle()
    var expanded by rememberSaveable { mutableStateOf(false) }

    val visible = !status.songId.isNullOrBlank() || status.title.isNotBlank()
    if (!visible) return

    if (expanded) {
        Dialog(
            onDismissRequest = { expanded = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            ExpandedPlayerSheet(
                status = status,
                onDismiss = { expanded = false },
                onTogglePlay = { NativePlaybackController.togglePlayPause(context) },
                onNext = { NativePlaybackController.skipNext(context) },
                onPrevious = { NativePlaybackController.skipPrevious(context) },
            )
        }
    }

    MiniPlayerBar(
        status = status,
        onTap = { expanded = true },
        onTogglePlay = { NativePlaybackController.togglePlayPause(context) },
        onNext = { NativePlaybackController.skipNext(context) },
        onPrevious = { NativePlaybackController.skipPrevious(context) },
        modifier = modifier,
    )
}

@Composable
private fun MiniPlayerBar(
    status: PlaybackStatus,
    onTap: () -> Unit,
    onTogglePlay: () -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val progress = if (status.durationSec > 0) {
        (status.positionSec / status.durationSec).toFloat().coerceIn(0f, 1f)
    } else {
        0f
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        shape = RoundedCornerShape(22.dp),
        color = Color(0xE6121216),
        tonalElevation = 0.dp,
        shadowElevation = 8.dp,
    ) {
        Column {
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp),
                color = MaterialTheme.colorScheme.primary,
                trackColor = Color.White.copy(alpha = 0.08f),
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onTap)
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.18f),
                                Color.Transparent,
                            )
                        )
                    )
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PlayerArtwork(
                    artworkUri = status.artworkUri,
                    modifier = Modifier.size(46.dp),
                )
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = status.title.ifBlank { "Now playing" },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = Color.White,
                    )
                    Text(
                        text = status.artist.ifBlank {
                            when {
                                status.isBuffering -> "Buffering…"
                                status.queueSize > 1 -> "Local · ${status.queueSize} tracks"
                                else -> "Local library"
                            }
                        },
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = Color.White.copy(alpha = 0.65f),
                    )
                }
                TransportCluster(
                    status = status,
                    onPrevious = onPrevious,
                    onTogglePlay = onTogglePlay,
                    onNext = onNext,
                    compact = true,
                )
            }
        }
    }
}

@Composable
private fun ExpandedPlayerSheet(
    status: PlaybackStatus,
    onDismiss: () -> Unit,
    onTogglePlay: () -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
) {
    val progress = if (status.durationSec > 0) {
        (status.positionSec / status.durationSec).toFloat().coerceIn(0f, 1f)
    } else {
        0f
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xF0121216))
            .padding(20.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                IconButton(onClick = onDismiss) {
                Icon(
                    Icons.Rounded.KeyboardArrowDown,
                    contentDescription = "Collapse",
                    tint = Color.White.copy(alpha = 0.7f),
                )
                }
            }
            PlayerArtwork(
                artworkUri = status.artworkUri,
                modifier = Modifier.size(180.dp),
                cornerRadius = 24,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = status.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = status.artist.ifBlank { "Unknown artist" },
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.65f),
            )
            Spacer(Modifier.height(20.dp))
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .clip(RoundedCornerShape(2.dp)),
                color = MaterialTheme.colorScheme.primary,
                trackColor = Color.White.copy(alpha = 0.1f),
            )
            Spacer(Modifier.height(20.dp))
            TransportCluster(
                status = status,
                onPrevious = onPrevious,
                onTogglePlay = onTogglePlay,
                onNext = onNext,
                compact = false,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Lyrics stage lands in Phase 3",
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.4f),
            )
        }
    }
}

@Composable
private fun TransportCluster(
    status: PlaybackStatus,
    onPrevious: () -> Unit,
    onTogglePlay: () -> Unit,
    onNext: () -> Unit,
    compact: Boolean,
) {
    val btnSize = if (compact) 40.dp else 52.dp
    val playSize = if (compact) 46.dp else 64.dp
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(
            onClick = onPrevious,
            enabled = status.hasPrevious,
            modifier = Modifier.size(btnSize),
        ) {
            Icon(
                Icons.Rounded.SkipPrevious,
                contentDescription = "Previous",
                tint = if (status.hasPrevious) Color.White else Color.White.copy(alpha = 0.25f),
            )
        }
        IconButton(
            onClick = onTogglePlay,
            modifier = Modifier
                .size(playSize)
                .clip(RoundedCornerShape(playSize / 2))
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.92f)),
        ) {
            Icon(
                imageVector = if (status.playWhenReady || status.isPlaying) {
                    Icons.Rounded.Pause
                } else {
                    Icons.Rounded.PlayArrow
                },
                contentDescription = if (status.isPlaying) "Pause" else "Play",
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(if (compact) 28.dp else 36.dp),
            )
        }
        IconButton(
            onClick = onNext,
            enabled = status.hasNext,
            modifier = Modifier.size(btnSize),
        ) {
            Icon(
                Icons.Rounded.SkipNext,
                contentDescription = "Next",
                tint = if (status.hasNext) Color.White else Color.White.copy(alpha = 0.25f),
            )
        }
    }
}

@Composable
private fun PlayerArtwork(
    artworkUri: String?,
    modifier: Modifier = Modifier,
    cornerRadius: Int = 12,
) {
    val shape = RoundedCornerShape(cornerRadius.dp)
    Box(
        modifier = modifier
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (!artworkUri.isNullOrBlank()) {
            AsyncImage(
                model = artworkUri,
                contentDescription = null,
                modifier = Modifier.matchParentSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Icon(
                imageVector = Icons.Rounded.MusicNote,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.secondary,
            )
        }
    }
}
