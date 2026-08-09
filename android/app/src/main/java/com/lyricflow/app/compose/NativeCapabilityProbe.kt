package com.lyricflow.app.compose

import android.content.Context
import com.lyricflow.app.luvs.LuvsEngine
import com.lyricflow.app.modules.MainPlayerModule
import com.lyricflow.app.modules.PaletteModule
import com.lyricflow.app.modules.PlayerBridge
import com.lyricflow.app.modules.SearchModule
import com.lyricflow.app.modules.SpotifyModule
import com.lyricflow.app.modules.StartupModule
import com.lyricflow.app.modules.YoutubeStreamModule
import com.lyricflow.app.services.PlaybackService
import com.lyricflow.app.services.QueueForwardingPlayer
import com.lyricflow.app.startup.StartupPreloader
import com.lyricflow.app.views.YoutubePlayerView
import com.lyricflow.app.workers.DownloadWorker

data class NativeCapabilityStatus(
    val label: String,
    val healthy: Boolean,
    val detail: String,
)

object NativeCapabilityProbe {
    fun collect(context: Context): List<NativeCapabilityStatus> {
        val libraryDbExists = context.getDatabasePath("lyricflow.db").exists()

        return listOf(
            probe(
                label = "Startup preload",
                clazz = StartupPreloader::class.java,
                detail = if (libraryDbExists) "library DB visible" else "library DB not found yet",
            ),
            probe("Playback service", PlaybackService::class.java, "Media3 service class linked"),
            probe("Queue bridge", QueueForwardingPlayer::class.java, "queue forwarding layer linked"),
            probe("Main player module", MainPlayerModule::class.java, "native player module linked"),
            probe("Player bridge", PlayerBridge::class.java, "player status bridge linked"),
            probe("Palette module", PaletteModule::class.java, "artwork color path linked"),
            probe("Spotify module", SpotifyModule::class.java, "Spotify import path linked"),
            probe("Search module", SearchModule::class.java, "search module linked"),
            probe("Startup module", StartupModule::class.java, "startup bridge linked"),
            probe("YouTube resolver", YoutubeStreamModule::class.java, "stream resolver linked"),
            probe("YouTube player view", YoutubePlayerView::class.java, "native video surface linked"),
            probe("Download worker", DownloadWorker::class.java, "offline file writer linked"),
            probe("Luvs engine", LuvsEngine::class.java, "Luvs subsystem linked"),
        )
    }

    private fun probe(
        label: String,
        clazz: Class<*>,
        detail: String,
    ): NativeCapabilityStatus = try {
        Class.forName(clazz.name, false, clazz.classLoader)
        NativeCapabilityStatus(label = label, healthy = true, detail = detail)
    } catch (error: Throwable) {
        NativeCapabilityStatus(
            label = label,
            healthy = false,
            detail = error.javaClass.simpleName,
        )
    }
}
