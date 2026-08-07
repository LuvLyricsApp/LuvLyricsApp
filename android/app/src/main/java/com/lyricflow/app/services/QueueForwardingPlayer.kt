package com.lyricflow.app.services

import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import com.lyricflow.app.modules.PlayerBridge

/**
 * ExoPlayer holds current (+ optional prepared next). When a next item is present,
 * notification skip uses native seekToNext. Otherwise it falls through to the JS queue.
 */
class QueueForwardingPlayer(private val player: Player) : ForwardingPlayer(player) {

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

    // Keep next/prev visible even when only JS owns the rest of the queue.
    override fun hasNextMediaItem(): Boolean = true

    override fun hasPreviousMediaItem(): Boolean = true

    override fun seekToNext() {
        if (player.hasNextMediaItem()) {
            player.seekToNextMediaItem()
        } else {
            PlayerBridge.onRemoteCommand?.invoke("next")
        }
    }

    override fun seekToNextMediaItem() {
        seekToNext()
    }

    override fun seekToPrevious() {
        PlayerBridge.onRemoteCommand?.invoke("previous")
    }

    override fun seekToPreviousMediaItem() {
        PlayerBridge.onRemoteCommand?.invoke("previous")
    }
}
