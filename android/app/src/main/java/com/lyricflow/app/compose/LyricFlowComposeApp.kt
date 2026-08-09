package com.lyricflow.app.compose

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.DownloadDone
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.ManageSearch
import androidx.compose.material.icons.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lyricflow.app.data.LegacyLibraryMigrator
import com.lyricflow.app.data.LibraryDatabase
import com.lyricflow.app.data.LibraryRepository
import com.lyricflow.app.data.MigrationVerifier
import com.lyricflow.app.player.NativePlaybackController

private data class ShellTab(
    val destination: ShellDestination,
    val icon: ImageVector,
)

private val shellTabs = listOf(
    ShellTab(ShellDestination.HOME, Icons.Rounded.Home),
    ShellTab(ShellDestination.LOCAL, Icons.Rounded.LibraryMusic),
    ShellTab(ShellDestination.PLAYLISTS, Icons.Rounded.QueueMusic),
    ShellTab(ShellDestination.LUVS, Icons.Rounded.AutoAwesome),
    ShellTab(ShellDestination.SEARCH, Icons.Rounded.ManageSearch),
)

@Composable
fun LyricFlowComposeApp(
    startDestination: ShellDestination,
    initialLaunchTarget: LaunchTarget,
    diagnostics: List<NativeCapabilityStatus>,
    onStartupDestinationSelected: (ShellDestination) -> Unit,
    onLaunchTargetSelected: (LaunchTarget) -> Unit,
    onOpenLegacyNow: () -> Unit,
) {
    var selectedTab by rememberSaveable { mutableStateOf(startDestination) }
    var startupDestination by rememberSaveable { mutableStateOf(startDestination) }
    var launchTarget by rememberSaveable { mutableStateOf(initialLaunchTarget) }
    var showSettings by rememberSaveable { mutableStateOf(false) }

    val appContext = LocalContext.current.applicationContext
    val libraryDb = remember { LibraryDatabase.build(appContext) }
    val libraryRepository = remember { LibraryRepository(libraryDb) }
    var migrationReport by remember { mutableStateOf<LegacyLibraryMigrator.Report?>(null) }
    LaunchedEffect(Unit) {
        NativePlaybackController.ensureBridge()
        migrationReport = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            val report = LegacyLibraryMigrator(appContext).run(libraryDb)
            try {
                MigrationVerifier.verify(appContext, libraryDb)
            } catch (t: Throwable) {
                android.util.Log.e(LegacyLibraryMigrator.TAG, "Parity verify failed", t)
            }
            report
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.background,
                        MaterialTheme.colorScheme.surface,
                        MaterialTheme.colorScheme.background,
                    )
                )
            )
            .safeDrawingPadding()
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            ShellTopBar(
                title = selectedTab.label,
                onOpenSettings = { showSettings = true },
            )

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                Crossfade(
                    targetState = selectedTab,
                    label = "shell-tab",
                ) { tab ->
                    ShellTabScene(
                        destination = tab,
                        diagnostics = diagnostics,
                        migrationReport = migrationReport,
                        libraryRepository = libraryRepository,
                        onOpenLegacyNow = onOpenLegacyNow,
                        onPlaySong = { song, queueSongs ->
                            NativePlaybackController.playFromLibrary(appContext, queueSongs, song)
                        },
                    )
                }
            }

            // Phase 2 slice 1: docked classic mini-player above the tab bar.
            ComposeMiniPlayer()

            NavigationBar(
                modifier = Modifier.navigationBarsPadding(),
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
                tonalElevation = 0.dp,
            ) {
                shellTabs.forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab.destination,
                        onClick = { selectedTab = tab.destination },
                        icon = {
                            Icon(
                                imageVector = tab.icon,
                                contentDescription = tab.destination.label,
                            )
                        },
                        label = { Text(tab.destination.label) },
                    )
                }
            }
        }

        if (showSettings) {
            ShellSettingsPanel(
                selectedStartupDestination = startupDestination,
                selectedLaunchTarget = launchTarget,
                onStartupDestinationSelected = {
                    startupDestination = it
                    onStartupDestinationSelected(it)
                    selectedTab = it
                },
                onLaunchTargetSelected = {
                    launchTarget = it
                    onLaunchTargetSelected(it)
                },
                onOpenLegacyNow = onOpenLegacyNow,
                onDismiss = { showSettings = false },
            )
        }
    }
}

@Composable
private fun ShellTopBar(
    title: String,
    onOpenSettings: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(end = 16.dp)
        ) {
            Text(
                text = "LuvLyrics 2.0",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.secondary,
            )
            Text(
                text = title,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        IconButton(
            onClick = onOpenSettings,
            modifier = Modifier
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.8f)),
        ) {
            Icon(Icons.Rounded.Settings, contentDescription = "Shell settings")
        }
    }
}

@Composable
private fun ShellTabScene(
    destination: ShellDestination,
    diagnostics: List<NativeCapabilityStatus>,
    migrationReport: LegacyLibraryMigrator.Report?,
    libraryRepository: LibraryRepository,
    onOpenLegacyNow: () -> Unit,
    onPlaySong: (com.lyricflow.app.data.SongEntity, List<com.lyricflow.app.data.SongEntity>) -> Unit,
) {
    when (destination) {
        ShellDestination.LOCAL -> LocalLibraryScreen(
            repository = libraryRepository,
            migrationReport = migrationReport,
        )
        ShellDestination.PLAYLISTS -> PlaylistsScreen(repository = libraryRepository)
        else -> ShellPlaceholderTab(
            destination = destination,
            diagnostics = diagnostics,
            onOpenLegacyNow = onOpenLegacyNow,
        )
    }
}

@Composable
private fun ShellPlaceholderTab(
    destination: ShellDestination,
    diagnostics: List<NativeCapabilityStatus>,
    onOpenLegacyNow: () -> Unit,
) {
    val copy = when (destination) {
        ShellDestination.HOME -> "Streaming feed lands here. This replaces the old JS home and becomes the default native front door."
        ShellDestination.LOCAL -> ""
        ShellDestination.PLAYLISTS -> ""
        ShellDestination.LUVS -> "The native Luvs subsystem already exists. This screen is reserved for rebuilding that exact experience in Compose."
        ShellDestination.SEARCH -> "Search stays a first-class tab because the native search module already exists and should plug straight into Compose."
    }

    val accent = when (destination) {
        ShellDestination.HOME -> MaterialTheme.colorScheme.primary
        ShellDestination.LOCAL -> MaterialTheme.colorScheme.secondary
        ShellDestination.PLAYLISTS -> MaterialTheme.colorScheme.tertiary
        ShellDestination.LUVS -> MaterialTheme.colorScheme.primary.copy(alpha = 0.85f)
        ShellDestination.SEARCH -> MaterialTheme.colorScheme.secondary.copy(alpha = 0.85f)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            HeroCard(destination = destination, copy = copy, accent = accent)
        }

        if (destination == ShellDestination.HOME) {
            item {
                LegacyBridgeCard(onOpenLegacyNow = onOpenLegacyNow)
            }
            item {
                DiagnosticsCard(diagnostics = diagnostics)
            }
        } else {
            item {
                PlaceholderMilestoneCard(destination = destination)
            }
        }
    }
}

@Composable
private fun HeroCard(
    destination: ShellDestination,
    copy: String,
    accent: Color,
) {
    Card(
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.86f)
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        colors = listOf(accent.copy(alpha = 0.36f), Color.Transparent)
                    )
                )
                .padding(22.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = destination.label.uppercase(),
                    style = MaterialTheme.typography.labelLarge,
                    color = accent,
                )
                Text(
                    text = when (destination) {
                        ShellDestination.HOME -> "Native shell first. Streaming next."
                        ShellDestination.LOCAL -> "Library-first cutover, no data loss."
                        ShellDestination.PLAYLISTS -> "Ordering survives the rewrite."
                        ShellDestination.LUVS -> "Keep the weird, not the web stack."
                        ShellDestination.SEARCH -> "Fast lookup without the bridge lag."
                    },
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = copy,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun LegacyBridgeCard(onOpenLegacyNow: () -> Unit) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)
        ),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Legacy RN is still here",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Phase 0 keeps the working React Native app reachable while Compose becomes the primary shell. Use it when you need the live app while parity is still in progress.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedButton(onClick = onOpenLegacyNow) {
                Text("Open legacy app now")
            }
        }
    }
}

@Composable
private fun DiagnosticsCard(diagnostics: List<NativeCapabilityStatus>) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)
        ),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.DownloadDone,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary,
                )
                Spacer(modifier = Modifier.size(10.dp))
                Text(
                    text = "Native systems linked",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            diagnostics.forEach { status ->
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = if (status.healthy) {
                        MaterialTheme.colorScheme.secondary.copy(alpha = 0.12f)
                    } else {
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                    }
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = status.label,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            text = if (status.healthy) {
                                "Ready: ${status.detail}"
                            } else {
                                "Needs attention: ${status.detail}"
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaceholderMilestoneCard(destination: ShellDestination) {
    val bullets = when (destination) {
        ShellDestination.HOME -> listOf(
            "Compose route is final",
            "Streaming feed lands in Phase 5",
            "Startup preference can already point here",
        )
        ShellDestination.LOCAL -> listOf(
            "Room migration targets this screen",
            "Library counts will be verified here",
            "Lyrics offset parity belongs here",
        )
        ShellDestination.PLAYLISTS -> listOf(
            "Playlist ordering must survive migration",
            "Spotify import UI plugs in later",
            "No nav reshuffle needed after Phase 0",
        )
        ShellDestination.LUVS -> listOf(
            "Native engine already exists",
            "UI rebuild follows player and migration",
            "Keep the feature decision visible in docs",
        )
        ShellDestination.SEARCH -> listOf(
            "Search module already links",
            "Compose UI replaces the current JS surface",
            "Streaming plus local search can merge here later",
        )
    }

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
            Text(
                text = "${destination.label} milestone",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            bullets.forEach { bullet ->
                Text(
                    text = "- $bullet",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ShellSettingsPanel(
    selectedStartupDestination: ShellDestination,
    selectedLaunchTarget: LaunchTarget,
    onStartupDestinationSelected: (ShellDestination) -> Unit,
    onLaunchTargetSelected: (LaunchTarget) -> Unit,
    onOpenLegacyNow: () -> Unit,
    onDismiss: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.42f))
            .padding(20.dp),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Card(
            shape = RoundedCornerShape(28.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(20.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                item {
                    Text(
                        text = "Shell settings",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                item {
                    SettingSection(
                        title = "Launch mode",
                        body = "Compose can be the default while the legacy RN app stays one tap away."
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            FilterChip(
                                selected = selectedLaunchTarget == LaunchTarget.COMPOSE_SHELL,
                                onClick = { onLaunchTargetSelected(LaunchTarget.COMPOSE_SHELL) },
                                label = { Text("Compose shell") },
                            )
                            FilterChip(
                                selected = selectedLaunchTarget == LaunchTarget.LEGACY_RN,
                                onClick = { onLaunchTargetSelected(LaunchTarget.LEGACY_RN) },
                                label = { Text("Legacy RN") },
                            )
                        }
                    }
                }
                item {
                    SettingSection(
                        title = "Startup page",
                        body = "Set the page the Compose shell should open first."
                    ) {
                        DestinationChipRows(
                            selectedStartupDestination = selectedStartupDestination,
                            onStartupDestinationSelected = onStartupDestinationSelected,
                        )
                    }
                }
                item {
                    Button(onClick = onOpenLegacyNow, modifier = Modifier.fillMaxWidth()) {
                        Text("Open legacy RN now")
                    }
                }
                item {
                    TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                        Text("Close")
                    }
                }
            }
        }
    }
}

@Composable
private fun DestinationChipRows(
    selectedStartupDestination: ShellDestination,
    onStartupDestinationSelected: (ShellDestination) -> Unit,
) {
    val firstRow = listOf(
        ShellDestination.HOME,
        ShellDestination.LOCAL,
        ShellDestination.PLAYLISTS,
    )
    val secondRow = listOf(
        ShellDestination.LUVS,
        ShellDestination.SEARCH,
    )

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        DestinationChipRow(firstRow, selectedStartupDestination, onStartupDestinationSelected)
        DestinationChipRow(secondRow, selectedStartupDestination, onStartupDestinationSelected)
    }
}

@Composable
private fun DestinationChipRow(
    destinations: List<ShellDestination>,
    selectedStartupDestination: ShellDestination,
    onStartupDestinationSelected: (ShellDestination) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        destinations.forEach { destination ->
            FilterChip(
                selected = selectedStartupDestination == destination,
                onClick = { onStartupDestinationSelected(destination) },
                label = { Text(destination.label) },
            )
        }
    }
}

@Composable
private fun SettingSection(
    title: String,
    body: String,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Medium,
        )
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        content()
    }
}
