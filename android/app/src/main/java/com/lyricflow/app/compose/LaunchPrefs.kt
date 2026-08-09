package com.lyricflow.app.compose

import android.content.Context

enum class LaunchTarget {
    COMPOSE_SHELL,
    LEGACY_RN,
}

enum class ShellDestination(val route: String, val label: String) {
    HOME("home", "Home"),
    LOCAL("local", "Local"),
    PLAYLISTS("playlists", "Playlists"),
    LUVS("luvs", "Luvs"),
    SEARCH("search", "Search");

    companion object {
        fun fromRoute(route: String?): ShellDestination =
            entries.firstOrNull { it.route == route } ?: HOME
    }
}

class LaunchPrefs(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getLaunchTarget(defaultComposeEnabled: Boolean): LaunchTarget {
        val stored = prefs.getString(KEY_LAUNCH_TARGET, null)
        return when (stored) {
            LaunchTarget.LEGACY_RN.name -> LaunchTarget.LEGACY_RN
            LaunchTarget.COMPOSE_SHELL.name -> LaunchTarget.COMPOSE_SHELL
            else -> if (defaultComposeEnabled) LaunchTarget.COMPOSE_SHELL else LaunchTarget.LEGACY_RN
        }
    }

    fun setLaunchTarget(target: LaunchTarget) {
        prefs.edit().putString(KEY_LAUNCH_TARGET, target.name).apply()
    }

    fun getStartupDestination(): ShellDestination =
        ShellDestination.fromRoute(
            prefs.getString(KEY_STARTUP_DESTINATION, ShellDestination.HOME.route)
        )

    fun setStartupDestination(destination: ShellDestination) {
        prefs.edit().putString(KEY_STARTUP_DESTINATION, destination.route).apply()
    }

    companion object {
        private const val PREFS_NAME = "compose_shell_prefs"
        private const val KEY_LAUNCH_TARGET = "launch_target"
        private const val KEY_STARTUP_DESTINATION = "startup_destination"
    }
}
