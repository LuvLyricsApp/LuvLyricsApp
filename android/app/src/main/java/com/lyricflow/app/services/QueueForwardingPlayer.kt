package com.lyricflow.app.services

import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import com.lyricflow.app.modules.PlayerBridge

/**
 * The playback queue lives in JS, so ExoPlayer only ever holds a single media item.
 * Left alone, Media3 would render the notification's next/previous buttons as
 * disabled — the player genuinely has nowhere to go.
 *
 * This wrapper advertises the seek-to-next/previous commands as available and
 * redirects them to the JS queue instead of ExoPlayer's own (empty) timeline.
 * Only the session sees this wrapper; PlayerBridge keeps talking to the real
 * ExoPlayer for status polling.
 */
class QueueForwardingPlayer(player: Player) : ForwardingPlayer(player) {

    override fun getAvailableCommands(): Player.Commands =
        super.getAvailableCommands()
            .buildUpon()
            .addAll(
                Player.COMMAND_SEEK_TO_NEXT,
                Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                Player.COMMAND_SEEK_TO_PREVIOUS,
                Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM
            )
            .build()

    override fun isCommandAvailable(command: Int): Boolean = when (command) {
        Player.COMMAND_SEEK_TO_NEXT,
        Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
        Player.COMMAND_SEEK_TO_PREVIOUS,
        Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> true
        else -> super.isCommandAvailable(command)
    }

    // Media3 hides the buttons when these report false.
    override fun hasNextMediaItem(): Boolean = true

    override fun hasPreviousMediaItem(): Boolean = true

    override fun seekToNext() {
        PlayerBridge.onRemoteCommand?.invoke("next")
    }

    override fun seekToNextMediaItem() {
        PlayerBridge.onRemoteCommand?.invoke("next")
    }

    override fun seekToPrevious() {
        PlayerBridge.onRemoteCommand?.invoke("previous")
    }

    override fun seekToPreviousMediaItem() {
        PlayerBridge.onRemoteCommand?.invoke("previous")
    }
}
