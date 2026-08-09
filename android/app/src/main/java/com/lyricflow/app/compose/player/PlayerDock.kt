package com.lyricflow.app.compose.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lyricflow.app.data.LibraryRepository
import com.lyricflow.app.player.NativePlaybackController
import kotlinx.coroutines.launch

/**
 * The docked player. This is the *only* player surface — there is deliberately
 * no standalone now-playing route, so the transport stays docked even when the
 * lyric reader is open (CLAUDE.md).
 *
 * Owns the stage, and loads the current track's lyrics from Room so the stage
 * renders without a network round trip.
 */
@Composable
fun PlayerDock(
    repository: LibraryRepository,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val status by NativePlaybackController.status.collectAsStateWithLifecycle()
    val currentSong by NativePlaybackController.currentSong.collectAsStateWithLifecycle()

    var stage by rememberSaveable { mutableStateOf(PlayerStage.COLLAPSED) }
    var lyrics by remember { mutableStateOf(SongLyrics.Empty) }
    var likedOverride by remember { mutableStateOf<Pair<String, Boolean>?>(null) }

    // Lyrics follow the loaded track. Reading through the repository keeps the
    // payload columns and the line rows in one query.
    LaunchedEffect(currentSong?.id) {
        val id = currentSong?.id
        if (id == null) {
            lyrics = SongLyrics.Empty
            return@LaunchedEffect
        }
        lyrics = repository.getSongWithLyrics(id)?.let(::buildSongLyrics) ?: SongLyrics.Empty
    }

    // A track change closes nothing — the reader stays where the user left it.
    val song = currentSong
    val isLiked = likedOverride?.takeIf { it.first == song?.id }?.second ?: (song?.isLiked == true)

    AnimatedVisibility(
        visible = !status.isIdle,
        enter = slideInVertically { it },
        exit = slideOutVertically { it },
        modifier = modifier.fillMaxWidth(),
    ) {
        ClassicPlayerBar(
            status = status,
            song = song?.copy(isLiked = isLiked),
            lyrics = lyrics,
            stage = stage,
            onStageChange = { stage = it },
            onTogglePlay = { NativePlaybackController.togglePlayPause(context) },
            onSkipNext = { NativePlaybackController.skipNext() },
            onSkipPrevious = { NativePlaybackController.skipPrevious() },
            onSeek = { NativePlaybackController.seekTo(it) },
            onToggleLike = {
                val target = song ?: return@ClassicPlayerBar
                val next = !isLiked
                // Optimistic so the tap registers immediately; Room is the
                // source of truth and the list flow will confirm it.
                likedOverride = target.id to next
                scope.launch { repository.setLiked(target.id, next) }
            },
        )
    }
}
