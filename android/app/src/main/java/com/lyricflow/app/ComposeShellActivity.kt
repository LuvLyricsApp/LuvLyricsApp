package com.lyricflow.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.lyricflow.app.compose.LaunchPrefs
import com.lyricflow.app.compose.LyricFlowComposeApp
import com.lyricflow.app.compose.NativeCapabilityProbe
import com.lyricflow.app.compose.ShellSurfaceTheme

class ComposeShellActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val launchPrefs = LaunchPrefs(this)

        setContent {
            ShellSurfaceTheme {
                LyricFlowComposeApp(
                    startDestination = launchPrefs.getStartupDestination(),
                    initialLaunchTarget = launchPrefs.getLaunchTarget(
                        BuildConfig.COMPOSE_SHELL_DEFAULT_ENABLED
                    ),
                    diagnostics = NativeCapabilityProbe.collect(applicationContext),
                    onStartupDestinationSelected = launchPrefs::setStartupDestination,
                    onLaunchTargetSelected = launchPrefs::setLaunchTarget,
                    onOpenLegacyNow = { openLegacyReactNative() },
                )
            }
        }
    }

    private fun openLegacyReactNative() {
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
        )
    }
}
