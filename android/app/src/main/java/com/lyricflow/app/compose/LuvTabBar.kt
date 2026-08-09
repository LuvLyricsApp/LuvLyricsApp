package com.lyricflow.app.compose

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp

/**
 * Port of src/components/CustomTabBar.tsx.
 *
 * Deliberate choices carried over from the RN original:
 *  · **Solid black, not a blur.** List content used to read straight through a
 *    translucent bar and collide with the icons; an opaque bar also meets the
 *    near-black bottom of the player pill without a visible seam.
 *  · **Icons only, no labels.** The legacy bar has never shown text.
 *  · **Inset as padding, not extra height.** edge-to-edge draws under the system
 *    bars, so growing the height alone just re-centres the icons into the
 *    gesture pill / 3-button strip.
 *  · Tabs split into left/right groups around a centre slot. The slot is where
 *    the voice mic lives in RN; it is left empty here because VoiceInputModule
 *    needs a React context that the Compose-first launch never initialises.
 */

private val TAB_BAR_HEIGHT = 64.dp
private val CENTRE_SLOT_WIDTH = 56.dp

@Composable
fun LuvTabBar(
    tabs: List<Pair<ShellDestination, ImageVector>>,
    selected: ShellDestination,
    onSelect: (ShellDestination) -> Unit,
    modifier: Modifier = Modifier,
) {
    val bottomInset = WindowInsets.navigationBars.asPaddingValues()
        .calculateBottomPadding()

    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(Color.Black)
            .height(TAB_BAR_HEIGHT + bottomInset)
            .padding(bottom = bottomInset)
    ) {
        val midpoint = (tabs.size + 1) / 2
        val left = tabs.take(midpoint)
        val right = tabs.drop(midpoint)

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight()
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            TabGroup(left, selected, onSelect, Modifier.weight(1f))
            // Centre slot — reserved for the mic so the icon rhythm matches the
            // RN bar even while the control itself is absent.
            Box(modifier = Modifier.size(CENTRE_SLOT_WIDTH, TAB_BAR_HEIGHT))
            TabGroup(right, selected, onSelect, Modifier.weight(1f))
        }
    }
}

@Composable
private fun TabGroup(
    tabs: List<Pair<ShellDestination, ImageVector>>,
    selected: ShellDestination,
    onSelect: (ShellDestination) -> Unit,
    modifier: Modifier,
) {
    Row(
        modifier = modifier.fillMaxHeight(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceAround,
    ) {
        tabs.forEach { (destination, icon) ->
            val isSelected = destination == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { if (!isSelected) onSelect(destination) },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = destination.label,
                    tint = if (isSelected) Color.White else Color.White.copy(alpha = 0.5f),
                    modifier = Modifier.size(24.dp),
                )
            }
        }
    }
}
