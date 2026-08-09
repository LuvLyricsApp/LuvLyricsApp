package com.lyricflow.app.compose

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lyricflow.app.data.LegacyLibraryMigrator
import com.lyricflow.app.data.LibraryRepository
import com.lyricflow.app.data.PlaylistWithSongCount
import com.lyricflow.app.data.SongEntity
import com.lyricflow.app.data.SongSort
import com.lyricflow.app.data.SongWithLyrics
import com.lyricflow.app.player.NativePlaybackController
import androidx.compose.ui.platform.LocalContext
import java.util.Locale

@Composable
fun LocalLibraryScreen(
    repository: LibraryRepository,
    migrationReport: LegacyLibraryMigrator.Report?,
    onPlaySong: (SongEntity) -> Unit = {},
) {
    val context = LocalContext.current
    var sort by rememberSaveable { mutableStateOf(SongSort.RECENT) }
    var likedOnly by rememberSaveable { mutableStateOf(false) }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var selectedSongId by rememberSaveable { mutableStateOf<String?>(null) }

    val trimmedQuery = searchQuery.trim()
    val songsFlow = remember(sort, likedOnly, trimmedQuery) {
        if (trimmedQuery.isNotEmpty()) {
            repository.search(trimmedQuery)
        } else {
            repository.observeSongs(sort, likedOnly)
        }
    }
    val songs by songsFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val visibleCount by repository.observeVisibleCount().collectAsStateWithLifecycle(initialValue = 0)
    val likedCount by repository.observeLikedCount().collectAsStateWithLifecycle(initialValue = 0)
    val offsetCount by repository.observeOffsetCount().collectAsStateWithLifecycle(initialValue = 0)
    val rawPayloadCount by repository.observeRawPayloadCount().collectAsStateWithLifecycle(initialValue = 0)
    val wordTimedCount by repository.observeWordTimedCount().collectAsStateWithLifecycle(initialValue = 0)

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                MigrationStatusCard(
                    report = migrationReport,
                    liveVisibleCount = visibleCount,
                    liveLikedCount = likedCount,
                    liveOffsetCount = offsetCount,
                    liveRawPayloadCount = rawPayloadCount,
                    liveWordTimedCount = wordTimedCount,
                )
            }

            item {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    leadingIcon = {
                        Icon(Icons.Rounded.Search, contentDescription = null)
                    },
                    placeholder = { Text("Search title or artist") },
                    shape = RoundedCornerShape(18.dp),
                )
            }

            item {
                LibraryFilterRow(
                    sort = sort,
                    likedOnly = likedOnly,
                    onSortSelected = { sort = it },
                    onLikedOnlyChanged = { likedOnly = it },
                )
            }

            item {
                Text(
                    text = if (trimmedQuery.isNotEmpty()) {
                        "${songs.size} match${if (songs.size == 1) "" else "es"}"
                    } else {
                        "$visibleCount songs"
                    },
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.secondary,
                )
            }

            if (songs.isEmpty()) {
                item {
                    EmptyLibraryCard(
                        hasMigration = migrationReport?.completed == true,
                        isSearching = trimmedQuery.isNotEmpty(),
                    )
                }
            } else {
                items(songs, key = { it.id }) { song ->
                    SongRow(
                        song = song,
                        onClick = {
                            NativePlaybackController.playFromLibrary(context, songs, song)
                        },
                        onLongClick = { selectedSongId = song.id },
                    )
                }
            }
        }

        selectedSongId?.let { songId ->
            SongDetailSheet(
                repository = repository,
                songId = songId,
                onDismiss = { selectedSongId = null },
                onPlay = { song ->
                    NativePlaybackController.playFromLibrary(context, songs, song)
                    selectedSongId = null
                },
            )
        }
    }
}

@Composable
fun PlaylistsScreen(repository: LibraryRepository) {
    val playlists by repository.observePlaylistsWithCount()
        .collectAsStateWithLifecycle(initialValue = emptyList())
    var expandedPlaylistId by rememberSaveable { mutableStateOf<String?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Card(
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.86f)
                ),
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "Playlists",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "${playlists.size} playlists migrated with sort order preserved.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        if (playlists.isEmpty()) {
            item {
                EmptyLibraryCard(
                    hasMigration = false,
                    isSearching = false,
                    message = "No playlists yet. Run the legacy app once so lyricflow.db exists, then reopen the Compose shell.",
                )
            }
        } else {
            items(playlists, key = { it.playlist.id }) { entry ->
                PlaylistCard(
                    entry = entry,
                    expanded = expandedPlaylistId == entry.playlist.id,
                    onToggle = {
                        expandedPlaylistId = if (expandedPlaylistId == entry.playlist.id) {
                            null
                        } else {
                            entry.playlist.id
                        }
                    },
                    repository = repository,
                )
            }
        }
    }
}

@Composable
private fun LibraryFilterRow(
    sort: SongSort,
    likedOnly: Boolean,
    onSortSelected: (SongSort) -> Unit,
    onLikedOnlyChanged: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FilterChip(
            selected = sort == SongSort.RECENT && !likedOnly,
            onClick = {
                onLikedOnlyChanged(false)
                onSortSelected(SongSort.RECENT)
            },
            label = { Text("Recent") },
        )
        FilterChip(
            selected = sort == SongSort.TITLE && !likedOnly,
            onClick = {
                onLikedOnlyChanged(false)
                onSortSelected(SongSort.TITLE)
            },
            label = { Text("Title") },
        )
        FilterChip(
            selected = sort == SongSort.ARTIST && !likedOnly,
            onClick = {
                onLikedOnlyChanged(false)
                onSortSelected(SongSort.ARTIST)
            },
            label = { Text("Artist") },
        )
        FilterChip(
            selected = likedOnly,
            onClick = { onLikedOnlyChanged(!likedOnly) },
            label = { Text("Liked") },
        )
    }
}

@Composable
private fun SongRow(
    song: SongEntity,
    onClick: () -> Unit,
    onLongClick: () -> Unit = {},
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick,
            ),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f)
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(
                        Brush.linearGradient(
                            colors = listOf(
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.45f),
                                MaterialTheme.colorScheme.secondary.copy(alpha = 0.35f),
                            )
                        )
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.MusicNote,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = song.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = song.artist?.takeIf { it.isNotBlank() } ?: "Unknown artist",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                SongBadgeRow(song = song)
            }
        }
    }
}

@Composable
private fun SongBadgeRow(song: SongEntity) {
    val badges = buildList {
        if (song.isLiked) add("liked")
        if (song.lyricsOffset != 0.0) add("offset")
        if (isWordTimed(song)) add("word")
        else if (!song.lyricsRaw.isNullOrBlank()) add("synced")
        song.lyricSource?.takeIf { it.isNotBlank() }?.let { add(it) }
    }
    if (badges.isEmpty()) return

    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        badges.take(4).forEach { badge ->
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = badgeColor(badge).copy(alpha = 0.16f),
            ) {
                Text(
                    text = badge,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = badgeColor(badge),
                )
            }
        }
    }
}

@Composable
private fun PlaylistCard(
    entry: PlaylistWithSongCount,
    expanded: Boolean,
    onToggle: () -> Unit,
    repository: LibraryRepository,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f)
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.QueueMusic,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.tertiary,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = entry.playlist.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "${entry.songCount} songs · order ${entry.playlist.sortOrder}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (expanded) {
                Spacer(modifier = Modifier.height(12.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
                Spacer(modifier = Modifier.height(12.dp))
                PlaylistSongsPreview(
                    repository = repository,
                    playlistId = entry.playlist.id,
                )
            }
        }
    }
}

@Composable
private fun PlaylistSongsPreview(
    repository: LibraryRepository,
    playlistId: String,
) {
    val songs by repository.observePlaylistSongs(playlistId)
        .collectAsStateWithLifecycle(initialValue = emptyList())

    if (songs.isEmpty()) {
        Text(
            text = "No songs in this playlist.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        songs.take(8).forEachIndexed { index, song ->
            Text(
                text = "${index + 1}. ${song.title} — ${song.artist ?: "Unknown"}",
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (songs.size > 8) {
            Text(
                text = "+ ${songs.size - 8} more",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.secondary,
            )
        }
    }
}

@Composable
private fun SongDetailSheet(
    repository: LibraryRepository,
    songId: String,
    onDismiss: () -> Unit,
    onPlay: (SongEntity) -> Unit = {},
) {
    var detail by remember(songId) { mutableStateOf<SongWithLyrics?>(null) }

    androidx.compose.runtime.LaunchedEffect(songId) {
        detail = repository.getSongWithLyrics(songId)
    }

    val song = detail?.song ?: return

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.45f))
            .clickable(onClick = onDismiss)
            .padding(20.dp),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = false) {},
            shape = RoundedCornerShape(28.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = song.title,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = song.artist ?: "Unknown artist",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                DetailRow("Source", song.lyricSource ?: "—")
                DetailRow("Format", song.lyricsFormat ?: "—")
                DetailRow("Sync type", song.lyricsSyncType ?: "—")
                DetailRow("Precision", song.lyricsPrecision ?: "—")
                DetailRow("Offset", "%.2fs".format(Locale.US, song.lyricsOffset))
                DetailRow("Lines", (detail?.lyrics?.size ?: 0).toString())
                DetailRow("Liked", if (song.isLiked) "yes" else "no")
                DetailRow("Play count", song.playCount.toString())
                DetailRow("Audio", if (song.audioUri.isNullOrBlank()) "missing" else "present")

                val previewLines = detail?.lyrics?.take(3).orEmpty()
                if (previewLines.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Lyric preview",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Medium,
                    )
                    previewLines.forEach { line ->
                        Text(
                            text = "[${line.timestamp}s] ${line.text}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }

                androidx.compose.material3.Button(
                    onClick = { onPlay(song) },
                    enabled = !song.audioUri.isNullOrBlank(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                ) {
                    Text(if (song.audioUri.isNullOrBlank()) "No audio file" else "Play in mini player")
                }

                Text(
                    text = "Tap outside to close",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
fun MigrationStatusCard(
    report: LegacyLibraryMigrator.Report?,
    liveVisibleCount: Int = 0,
    liveLikedCount: Int = 0,
    liveOffsetCount: Int = 0,
    liveRawPayloadCount: Int = 0,
    liveWordTimedCount: Int = 0,
) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)
        ),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.Timer,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary,
                )
                Spacer(modifier = Modifier.size(10.dp))
                Text(
                    text = "Library migration",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            when {
                report == null -> {
                    Text(
                        text = "Migrating your library from the legacy database…",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                report.error != null -> {
                    Text(
                        text = "Migration failed: ${report.error}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                else -> {
                    MigrationStatRow("Songs", report.songs, liveVisibleCount)
                    MigrationStatRow("Lyric lines", report.lyricLines)
                    MigrationStatRow("Playlists", report.playlists)
                    MigrationStatRow("Playlist links", report.playlistLinks)
                    MigrationStatRow("Liked", report.likedSongs, liveLikedCount)
                    MigrationStatRow("Offset adjusted", report.offsetSongs, liveOffsetCount)
                    MigrationStatRow("Raw payloads", report.rawPayloadSongs, liveRawPayloadCount)
                    MigrationStatRow("Word-timed", report.wordTimedSongs, liveWordTimedCount)
                    if (report.completed) {
                        Text(
                            text = "Backup: ${report.backupPath ?: "none"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MigrationStatRow(label: String, migrated: Int, live: Int? = null) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        val valueText = if (live != null && live > 0 && live != migrated) {
            "$migrated → $live live"
        } else {
            migrated.toString()
        }
        Text(
            text = valueText,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun EmptyLibraryCard(
    hasMigration: Boolean,
    isSearching: Boolean,
    message: String? = null,
) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)
        ),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = when {
                    message != null -> "Nothing here yet"
                    isSearching -> "No matches"
                    hasMigration -> "Library is empty"
                    else -> "Waiting for legacy database"
                },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = message ?: when {
                    isSearching -> "Try a different search term."
                    hasMigration -> "Migration completed but found zero visible songs."
                    else -> "Open the legacy RN app once to create lyricflow.db, then return here."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun isWordTimed(song: SongEntity): Boolean {
    val precision = song.lyricsPrecision?.lowercase(Locale.US)
    val sync = song.lyricsSyncType?.lowercase(Locale.US)
    val format = song.lyricsFormat?.lowercase(Locale.US)
    return precision == "word" || sync == "richsync" || format == "ttml"
}

@Composable
private fun badgeColor(badge: String): Color = when (badge.lowercase(Locale.US)) {
    "liked" -> MaterialTheme.colorScheme.primary
    "offset" -> MaterialTheme.colorScheme.tertiary
    "word" -> MaterialTheme.colorScheme.secondary
    "synced" -> MaterialTheme.colorScheme.secondary.copy(alpha = 0.85f)
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}
