package com.lyricflow.app.compose

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.lyricflow.app.compose.player.ArtworkFlowBackground
import com.lyricflow.app.data.LibraryRepository
import com.lyricflow.app.data.SongEntity
import com.lyricflow.app.data.SongSort
import com.lyricflow.app.player.NativePlaybackController

/**
 * The LuvLyrics home screen, ported from src/screens/LibraryScreen.tsx onto the
 * migrated Room library.
 *
 * Layout, top to bottom, matching the RN original:
 *   ambient artwork wash → "LuvLyrics" wordmark + actions → recently-played
 *   art row → the song list.
 *
 * Read-only by design: RN still owns the live SQLite library until Phase 8, so
 * nothing here edits, renames, deletes or hides a song.
 */

private const val RECENT_SONGS_MAX = 16

@Composable
fun LocalHomeScreen(
    repository: LibraryRepository,
    onOpenQueue: () -> Unit,
    onOpenDownloader: () -> Unit,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var sort by remember { mutableStateOf(SongSort.RECENT) }

    // No search field here — searching is the Search tab's job, exactly as in the
    // legacy home screen. Adding one duplicated a whole tab in-page.
    val songsFlow = remember(sort) { repository.observeSongs(sort) }
    val songs by songsFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val currentSong by NativePlaybackController.currentSong.collectAsStateWithLifecycle()
    val status by NativePlaybackController.status.collectAsStateWithLifecycle()

    // "Recently played" is last_played DESC, non-null, capped — the same rule the
    // RN grid uses.
    val recents = remember(songs) {
        songs.filter { !it.lastPlayed.isNullOrBlank() }
            .sortedByDescending { it.lastPlayed }
            .take(RECENT_SONGS_MAX)
    }

    Box(modifier = modifier.fillMaxSize().background(Color.Black)) {
        // Ambient artwork wash behind the header — the Aurora equivalent. Reuses
        // the player's palette extraction rather than adding a second pipeline.
        Box(modifier = Modifier.fillMaxWidth().height(320.dp)) {
            ArtworkFlowBackground(
                coverUri = currentSong?.coverImageUri,
                modifier = Modifier.fillMaxSize(),
                animated = status.isPlaying || status.playWhenReady,
            )
            // Fade the wash into the page so there is no hard edge under the list.
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            0f to Color.Black.copy(alpha = 0.35f),
                            0.55f to Color.Black.copy(alpha = 0.72f),
                            1f to Color.Black,
                        )
                    )
            )
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().statusBarsPadding(),
            contentPadding = PaddingValues(bottom = 24.dp),
        ) {
            item {
                BrandRow(
                    onOpenQueue = onOpenQueue,
                    onOpenDownloader = onOpenDownloader,
                    onOpenSettings = onOpenSettings,
                )
            }

            if (recents.isNotEmpty()) {
                item {
                    RecentlyPlayedRow(
                        songs = recents,
                        onPlay = { song ->
                            NativePlaybackController.playFromLibrary(context, recents, song)
                        },
                    )
                }
            }

            item {
                SortRow(
                    sort = sort,
                    onSort = { sort = it },
                    count = songs.size,
                )
            }

            items(songs, key = { it.id }) { song ->
                SongRow(
                    song = song,
                    isCurrent = song.id == status.songId,
                    onClick = {
                        // The list you tapped from is the list you skip through.
                        NativePlaybackController.playFromLibrary(context, songs, song)
                    },
                )
            }

            if (songs.isEmpty()) {
                item { EmptyState() }
            }
        }
    }
}

@Composable
private fun BrandRow(
    onOpenQueue: () -> Unit,
    onOpenDownloader: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 14.dp, end = 12.dp, top = 12.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Exactly the legacy wordmark: 34sp, weight 900, letter-spacing -1.5, and
        // the platform font — deliberately NOT SF Pro, both because the brand
        // reads better in the system face and because it keeps the wordmark clear
        // of Apple's font licensing.
        Text(
            text = "LuvLyrics",
            color = Color.White,
            fontSize = 34.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = (-1.5).sp,
            maxLines = 1,
            style = androidx.compose.ui.text.TextStyle(
                shadow = androidx.compose.ui.graphics.Shadow(
                    color = Color.Black.copy(alpha = 0.3f),
                    offset = androidx.compose.ui.geometry.Offset(0f, 2f),
                    blurRadius = 4f,
                ),
            ),
            modifier = Modifier
                .weight(1f)
                .padding(start = 6.dp, end = 10.dp),
        )
        BrandAction(Icons.AutoMirrored.Rounded.List, "Download queue", onOpenQueue)
        BrandAction(Icons.Rounded.CloudDownload, "Audio downloader", onOpenDownloader)
        BrandAction(Icons.Rounded.Settings, "Settings", onOpenSettings)
    }
}

@Composable
private fun BrandAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(38.dp)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = Color.White,
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
private fun RecentlyPlayedRow(songs: List<SongEntity>, onPlay: (SongEntity) -> Unit) {
    LazyRow(
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 4.dp),
        contentPadding = PaddingValues(start = 26.dp, end = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(songs, key = { it.id }) { song ->
            Column(
                modifier = Modifier
                    .width(160.dp)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onPlay(song) }
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(LuvColors.ArtworkPlaceholder),
                    contentAlignment = Alignment.Center,
                ) {
                    if (song.coverImageUri.isNullOrBlank()) {
                        Icon(
                            imageVector = Icons.Rounded.MusicNote,
                            contentDescription = null,
                            tint = Color.White.copy(alpha = 0.35f),
                        )
                    } else {
                        AsyncImage(
                            model = song.coverImageUri,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    text = song.title,
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.2).sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = song.artist.orEmpty(),
                    color = LuvColors.TextMuted,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun SortRow(
    sort: SongSort,
    onSort: (SongSort) -> Unit,
    count: Int,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "$count songs",
            color = LuvColors.TextMuted,
            fontSize = 12.sp,
            modifier = Modifier.weight(1f),
        )
        SongSort.entries.forEach { option ->
            val label = when (option) {
                SongSort.RECENT -> "Recent"
                SongSort.TITLE -> "Title"
                SongSort.ARTIST -> "Artist"
            }
            Text(
                text = label,
                color = if (option == sort) Color.White else LuvColors.TextMuted,
                fontSize = 12.sp,
                fontWeight = if (option == sort) FontWeight.SemiBold else FontWeight.Normal,
                modifier = Modifier
                    .padding(start = 14.dp)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onSort(option) },
            )
        }
    }
}

@Composable
private fun SongRow(
    song: SongEntity,
    isCurrent: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .padding(bottom = 8.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (isCurrent) LuvColors.CardHover else Color.Transparent)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .height(72.dp)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(LuvColors.ArtworkPlaceholder),
            contentAlignment = Alignment.Center,
        ) {
            if (song.coverImageUri.isNullOrBlank()) {
                Icon(
                    imageVector = Icons.Rounded.MusicNote,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.35f),
                    modifier = Modifier.size(20.dp),
                )
            } else {
                AsyncImage(
                    model = song.coverImageUri,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = song.title,
                color = if (isCurrent) MaterialTheme.colorScheme.tertiary else Color(0xFFEDEDED),
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = song.artist.orEmpty().ifBlank { "Unknown artist" },
                color = LuvColors.TextMuted,
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (song.duration > 0) {
            Text(
                text = formatDuration(song.duration),
                color = LuvColors.TextMuted,
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun EmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 32.dp, vertical = 64.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = Icons.Rounded.MusicNote,
            contentDescription = null,
            tint = LuvColors.TextMuted,
            modifier = Modifier.size(40.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = "Your library is empty",
            color = Color(0xFFEDEDED),
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun formatDuration(seconds: Int): String {
    val minutes = seconds / 60
    val secs = seconds % 60
    return "$minutes:${secs.toString().padStart(2, '0')}"
}
