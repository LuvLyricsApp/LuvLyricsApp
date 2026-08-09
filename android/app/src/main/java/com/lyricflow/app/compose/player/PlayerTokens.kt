package com.lyricflow.app.compose.player

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Player design tokens, ported 1:1 from the RN player so the native surface is
 * visually indistinguishable from the shipping app.
 *
 * Provenance for every value in this file:
 *   src/components/MiniPlayer.tsx          (stages, transport row, island, marquee)
 *   src/components/TimelineScrubber.tsx    (glass scrubber)
 *   src/components/ArtworkFlowBackground.tsx (flow timing — see ArtworkFlow.kt)
 *   src/constants/layout.ts                (bar + tab heights)
 *
 * These are tuned constants, not arbitrary ones. Several carry comments in the
 * RN source explaining what broke at other values; those notes are reproduced
 * here. Do not "round them off" — the numbers are the design.
 */
object PlayerTokens {

    // ── Classic bar geometry ──────────────────────────────────────────────
    // src/constants/layout.ts
    val TabBarHeight = 64.dp
    val ClassicBarHeight = 70.dp

    /** Transport / song row height. Scrubber sits on its top edge. */
    val ClassicTransportHeight = ClassicBarHeight

    /**
     * Touch height of the classic scrubber wrapper, bottom-anchored at
     * (ClassicTransportHeight - this) so its TOP edge lands exactly on the
     * transport row's top seam. The extra height below the track exists only
     * because Android clips touch dispatch to the parent's bounds, which would
     * otherwise throw away the scrubber's hit slop.
     */
    val ClassicScrubberHitHeight = 32.dp

    /**
     * Classic shell height at the two open stages, as a fraction of screen
     * height. Tuned against the Home screen: the half-open bar should swallow
     * the whole song list while leaving the recently-played cards readable.
     * 0.54 let the first list row peek out; 0.60 rode up over the card
     * captions. 0.565 sits between the two.
     */
    const val ClassicHalfRatio = 0.565f
    const val ClassicFullRatio = 0.915f

    val ClassicTransportPaddingLeft = 12.dp

    /**
     * The play button used to sit ~2px off the screen edge. Its own 4dp padding
     * plus this keeps the icon a comfortable 18dp in, matching the artwork
     * inset on the left so the row reads as balanced.
     */
    val ClassicTransportPaddingRight = 14.dp

    /** Room for the top-edge scrubber track. */
    val ClassicTransportPaddingTop = 12.dp

    /**
     * Hit rails for stage changes. Wide enough to hit reliably with a thumb,
     * narrow enough that the lyric text (which carries its own 32dp of
     * horizontal padding) stays fully scrollable.
     */
    val ClassicStageRailWidth = 36.dp

    val ClassicLyricsPaddingTop = 10.dp

    // ── Artwork + text ────────────────────────────────────────────────────
    val CoverThumbnailSize = 48.dp
    val CoverThumbnailRadius = 6.dp
    val CoverThumbnailSpacing = 12.dp

    val TitleSize = 14.sp
    val ArtistSize = 12.sp
    val ArtistColor = Color(0xFF888888)

    /** MiniPlayer lyric tray (collapsed / island single line). */
    val TrayLyricSize = 18.sp

    /** Expanded lyric stage. */
    val ExpandedLyricSize = 23.sp

    /** Lowest opacity the lyric stage dips to while swapping songs. Never 0. */
    const val LyricSwapDip = 0.3f
    const val LyricSwapDipMs = 190

    // ── Island ────────────────────────────────────────────────────────────
    val IslandBackground = Color(0xFF09090C)
    const val IslandCollapsedWidthFraction = 0.62f

    /** Expanded island inset from each screen edge (RN: width - 24). */
    val IslandExpandedHorizontalInset = 24.dp
    val IslandCollapsedHeight = 50.dp
    const val IslandExpandedHeightFraction = 0.56f
    val IslandCollapsedRadius = 25.dp
    val IslandExpandedRadius = 30.dp
    val IslandCoverSize = 34.dp
    val IslandCoverSpacing = 6.dp
    val IslandHorizontalPadding = 4.dp
    val IslandVerticalPadding = 8.dp

    // ── Scrubber ──────────────────────────────────────────────────────────
    val ScrubberTrackHeightIdle = 2.dp
    val ScrubberTrackHeightActive = 6.dp
    val ScrubberTrackColor = Color(0x4DFFFFFF) // rgba(255,255,255,0.3)
    val ScrubberFillColor = Color.White
    val ScrubberDotSize = 12.dp

    // ── Motion ────────────────────────────────────────────────────────────
    const val IslandOpenMs = 420

    /** RN: Easing.bezier(0.22, 1, 0.36, 1) */
    val IslandOpenEase = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)

    /** RN: Easing.bezier(0.445, 0.05, 0.55, 0.95) — easeInOutSine. */
    val EaseInOutSine = CubicBezierEasing(0.445f, 0.05f, 0.55f, 0.95f)

    // ── Title marquee ─────────────────────────────────────────────────────
    // Long titles read from their first character, then make one complete
    // leftward pass. They return to the start and rest before the next pass;
    // no distracting ping-pong motion.
    const val TitleMarqueePauseMs = 3500
    const val TitleMarqueePixelsPerSecond = 28f
    const val TitleMarqueeMinTravelMs = 2600

    // ── Stage-change gesture ──────────────────────────────────────────────
    /** Fraction of the stage's travel that commits the stage change on release. */
    const val StageCommitFraction = 0.35f

    /** Velocity (px/s) that commits a stage change regardless of distance. */
    const val StageCommitVelocity = 900f
}

/** The three stages of the docked classic player. */
enum class PlayerStage { COLLAPSED, HALF, FULL }

/** Which presentation the docked player is using. */
enum class PlayerPresentation { CLASSIC, ISLAND }
