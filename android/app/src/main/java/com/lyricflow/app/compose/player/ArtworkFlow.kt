package com.lyricflow.app.compose.player

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableFloatState
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.palette.graphics.Palette
import coil.ImageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Compose port of src/components/ArtworkFlowBackground.tsx.
 *
 * The RN original renders an SkSL runtime shader through react-native-skia.
 * Android's equivalent (AGSL / RuntimeShader) is **API 33+**, and the target
 * device runs API 31, so the colour field is rendered instead as three blurred
 * radial fields over a base colour.
 *
 * Everything that defines the *look* is ported exactly:
 *   · the palette ranking, chroma boost and the two luminance ceilings
 *   · the anchor paths (same frequencies, phases and amplitudes)
 *   · the field radii and mix weights
 *   · the edge falloff, the 1500 ms crossfade and the /165 time divisor
 *
 * Compositing note: the shader's sequential `mix(colour, field, weight * k)` is
 * exactly source-over alpha compositing with `alpha = weight * k`, so drawing
 * base → A → B → C with those alphas reproduces the shader's output rather than
 * merely approximating it. The one real simplification is per-pixel domain
 * warping, which is applied per-anchor here instead of per-pixel; under a 30 dp
 * blur the difference is not visible.
 */

private const val TRACK_CHANGE_MS = 1500
private val FLOW_BLUR = 30.dp

/**
 * Brightness ceilings, measured against the same weighted-sRGB luminance used
 * throughout. Scaling all three channels by one factor keeps the artwork's hue
 * and saturation and removes only brightness.
 *
 * The base and the moving fields are capped *differently* on purpose. Clamping
 * them to one value makes the surface uniformly dim and the blobs stop reading
 * as separate shapes at all. Holding the base well below the fields is what
 * gives the blobs their edge.
 *
 * BASE 0.14  — a dark foundation the fields can sit proud of.
 * FIELD 0.48 — ~0.20 true relative luminance, about 3.6:1 against white. Lyrics
 *              render large and bold, where WCAG AA asks 3:1, so this stays
 *              legible while letting the colour actually show.
 */
private const val BASE_MAX_LUMINANCE = 0.14f
private const val FIELD_MAX_LUMINANCE = 0.48f

/** A linear RGB triple in 0..1. */
internal data class Rgb(val r: Float, val g: Float, val b: Float)

/** base, fieldA, fieldB, fieldC — the four colours the flow is built from. */
internal data class FlowPalette(
    val base: Rgb,
    val fieldA: Rgb,
    val fieldB: Rgb,
    val fieldC: Rgb,
) {
    internal companion object
}

private data class PaletteCandidate(
    val color: Int,
    val population: Int,
    val role: String? = null,
)

private fun Rgb.toColor(alpha: Float = 1f) = Color(r, g, b, alpha)

private fun Int.toRgb() = Rgb(
    ((this shr 16) and 0xFF) / 255f,
    ((this shr 8) and 0xFF) / 255f,
    (this and 0xFF) / 255f,
)

private fun luminance(c: Rgb) = c.r * 0.2126f + c.g * 0.7152f + c.b * 0.0722f

private fun darken(c: Rgb, amount: Float) = Rgb(c.r * amount, c.g * amount, c.b * amount)

private fun capLuminance(c: Rgb, maximum: Float): Rgb {
    val lum = luminance(c)
    if (lum <= maximum || lum == 0f) return c
    val scale = maximum / lum
    return Rgb(c.r * scale, c.g * scale, c.b * scale)
}

private fun boostChroma(c: Rgb, amount: Float): Rgb {
    val lum = luminance(c)
    fun boost(channel: Float) = min(1f, max(0f, lum + (channel - lum) * amount))
    return Rgb(boost(c.r), boost(c.g), boost(c.b))
}

private fun saturationOf(c: Rgb): Float {
    val maximum = max(c.r, max(c.g, c.b))
    val minimum = min(c.r, min(c.g, c.b))
    return if (maximum == 0f) 0f else (maximum - minimum) / maximum
}

private fun blend(from: Rgb, to: Rgb, amount: Float) = Rgb(
    from.r + (to.r - from.r) * amount,
    from.g + (to.g - from.g) * amount,
    from.b + (to.b - from.b) * amount,
)

private fun colorDistance(left: Rgb, right: Rgb) =
    sqrt(
        (left.r - right.r) * (left.r - right.r) +
            (left.g - right.g) * (left.g - right.g) +
            (left.b - right.b) * (left.b - right.b)
    )

private val WHITE = Rgb(1f, 1f, 1f)
private val BLACK = Rgb(0f, 0f, 0f)

/** Neutral near-black used when a cover yields nothing usable. */
private val FALLBACK_BASE = Rgb(0.06f, 0.07f, 0.11f)

internal val DefaultFlowPalette: FlowPalette = FlowPalette(
    base = capLuminance(FALLBACK_BASE, BASE_MAX_LUMINANCE),
    fieldA = capLuminance(blend(FALLBACK_BASE, WHITE, 0.18f), FIELD_MAX_LUMINANCE),
    fieldB = capLuminance(blend(FALLBACK_BASE, WHITE, 0.10f), FIELD_MAX_LUMINANCE),
    fieldC = capLuminance(blend(FALLBACK_BASE, WHITE, 0.06f), FIELD_MAX_LUMINANCE),
)

/**
 * Palette's named swatches describe different targets, not equal-weight
 * colours. Preserve their sampled pixel population so a small neon logo cannot
 * outweigh the cover's actual colour field. When a cover has one colour family,
 * derived tonal neighbours keep the flow alive without introducing an unrelated
 * hue.
 */
private fun createFlowPalette(candidates: List<PaletteCandidate>): FlowPalette {
    if (candidates.isEmpty()) return DefaultFlowPalette

    val maxPopulation = max(candidates.maxOf { it.population }, 1)
    val hasMeaningfulColor = candidates.any {
        val fraction = if (it.population > 0) {
            it.population.toFloat() / maxPopulation
        } else {
            0.56f
        }
        saturationOf(it.color.toRgb()) >= 0.22f && fraction >= 0.18f
    }

    fun score(candidate: PaletteCandidate): Float {
        val rgb = candidate.color.toRgb()
        val saturation = saturationOf(rgb)
        val lum = luminance(rgb)
        val fraction = if (candidate.population > 0) {
            candidate.population.toFloat() / maxPopulation
        } else {
            0.56f
        }
        val population = sqrt(fraction)
        val neutralPenalty = if (hasMeaningfulColor && saturation < 0.12f) 0.36f else 0f
        val readableLightness = if (lum >= 0.06f && lum <= 0.88f) 0.08f else 0f
        val dominantBias = if (candidate.role == "dominant") 0.06f else 0f
        return population * 1.1f + saturation * 0.32f + readableLightness + dominantBias - neutralPenalty
    }

    val ranked = candidates.sortedByDescending { score(it) }
    val base = ranked.first().color.toRgb()
    val alternatives = ranked.drop(1)
        .map { it.color.toRgb() }
        .filter { colorDistance(base, it) > 0.11f }

    val accentA = alternatives.getOrNull(0) ?: blend(base, WHITE, 0.18f)
    val accentB = alternatives.getOrNull(1) ?: blend(base, BLACK, 0.28f)
    val accentC = alternatives.getOrNull(2) ?: blend(base, WHITE, 0.08f)
    val vividBase = boostChroma(base, 1.34f)

    // Keep every moving field visually tied to the winning main colour, so the
    // surface reads as one artwork-led atmosphere rather than four competing
    // palette swatches. Cap last, after every boost, so no cover can outrun the
    // ceiling — luminance is linear in RGB, so a blend of capped fields is still
    // capped and the composited output inherits the guarantee.
    //
    // Chroma is boosted harder than brightness is allowed to rise: that is what
    // "vibrant but readable" actually means. Saturation carries the colour, the
    // cap keeps white text on top of it legible.
    return FlowPalette(
        base = capLuminance(darken(vividBase, 0.82f), BASE_MAX_LUMINANCE),
        fieldA = capLuminance(darken(boostChroma(blend(vividBase, accentA, 0.80f), 1.68f), 1.12f), FIELD_MAX_LUMINANCE),
        fieldB = capLuminance(darken(boostChroma(blend(vividBase, accentB, 0.70f), 1.54f), 1.06f), FIELD_MAX_LUMINANCE),
        fieldC = capLuminance(darken(boostChroma(blend(vividBase, accentC, 0.62f), 1.44f), 1.08f), FIELD_MAX_LUMINANCE),
    )
}

/**
 * Reads the cover with Coil and ranks its swatches. Mirrors PaletteModule.kt:
 * all swatches when present, otherwise the named ones with `dominant` tagged so
 * it keeps its ranking bias.
 */
internal suspend fun extractFlowPalette(context: Context, coverUri: String?): FlowPalette? {
    if (coverUri.isNullOrBlank()) return null
    return withContext(Dispatchers.IO) {
        runCatching {
            val request = ImageRequest.Builder(context)
                .data(coverUri)
                // Palette cannot read a hardware bitmap's pixels.
                .allowHardware(false)
                .size(160)
                .build()
            val result = ImageLoader(context).execute(request)
            if (result !is SuccessResult) return@runCatching null
            val bitmap = (result.drawable as? android.graphics.drawable.BitmapDrawable)?.bitmap
                ?: return@runCatching null
            val safe = if (bitmap.config == Bitmap.Config.HARDWARE) {
                bitmap.copy(Bitmap.Config.ARGB_8888, false)
            } else {
                bitmap
            }
            val palette = Palette.from(safe).generate()
            val candidates = if (palette.swatches.isNotEmpty()) {
                palette.swatches.map { PaletteCandidate(it.rgb, it.population) }
            } else {
                listOfNotNull(
                    palette.dominantSwatch?.let { PaletteCandidate(it.rgb, it.population, "dominant") },
                    palette.vibrantSwatch?.let { PaletteCandidate(it.rgb, it.population, "vibrant") },
                    palette.darkVibrantSwatch?.let { PaletteCandidate(it.rgb, it.population, "darkVibrant") },
                    palette.mutedSwatch?.let { PaletteCandidate(it.rgb, it.population, "muted") },
                    palette.lightVibrantSwatch?.let { PaletteCandidate(it.rgb, it.population, "lightVibrant") },
                    palette.darkMutedSwatch?.let { PaletteCandidate(it.rgb, it.population, "darkMuted") },
                )
            }
            if (candidates.isEmpty()) null else createFlowPalette(candidates)
        }.getOrNull()
    }
}

/**
 * Smoothstep weight of a field at normalised distance `t` from its centre,
 * matching the shader's `smoothstep(radius, radius * 0.10, distance)`.
 */
private fun fieldWeight(t: Float): Float {
    val inner = 0.10f
    if (t <= inner) return 1f
    if (t >= 1f) return 0f
    val u = (t - inner) / (1f - inner)
    return 1f - (u * u * (3f - 2f * u))
}

/** Radial stops approximating the shader's smoothstep falloff. */
private fun fieldStops(color: Rgb, peakAlpha: Float): Array<Pair<Float, Color>> {
    val samples = floatArrayOf(0f, 0.10f, 0.325f, 0.55f, 0.775f, 1f)
    return Array(samples.size) { index ->
        val t = samples[index]
        samples[index] to color.toColor(fieldWeight(t) * peakAlpha)
    }
}

private fun DrawScope.drawField(
    color: Rgb,
    centerUv: Offset,
    radiusUv: Float,
    peakAlpha: Float,
) {
    // The shader works in uv space, where x and y are each normalised to 0..1.
    // A "circle" there is an ellipse on a non-square canvas, so the field is
    // drawn into a scaled space to keep that anisotropy rather than correcting
    // it away.
    val center = Offset(centerUv.x * size.width, centerUv.y * size.height)
    val radius = Offset(radiusUv * size.width, radiusUv * size.height)
    // Compose radial gradients are circular, so the ellipse is produced by
    // drawing a circular field of the larger radius and scaling the shorter
    // axis down around the centre.
    val major = max(radius.x, radius.y)
    if (major <= 0f) return
    val scaleX = radius.x / major
    val scaleY = radius.y / major

    withTransformSafe(center, scaleX, scaleY) {
        drawCircle(
            brush = Brush.radialGradient(
                colorStops = fieldStops(color, peakAlpha),
                center = center,
                radius = major,
            ),
            radius = major,
            center = center,
        )
    }
}

/** `scale` around an arbitrary pivot, kept local so the draw path stays flat. */
private inline fun DrawScope.withTransformSafe(
    pivot: Offset,
    scaleX: Float,
    scaleY: Float,
    block: DrawScope.() -> Unit,
) {
    if (scaleX == 1f && scaleY == 1f) {
        block()
        return
    }
    drawContext.canvas.save()
    drawContext.canvas.translate(pivot.x, pivot.y)
    drawContext.canvas.scale(scaleX, scaleY)
    drawContext.canvas.translate(-pivot.x, -pivot.y)
    block()
    drawContext.canvas.restore()
}

/**
 * Draws one complete colour field at time `t`. Anchor paths, radii and mix
 * weights are the shader's, unchanged.
 */
private fun DrawScope.drawFlowLayer(palette: FlowPalette, t: Float, alpha: Float) {
    if (alpha <= 0.001f) return

    // Domain warp. The shader evaluates this per pixel; here it is evaluated
    // once per anchor, which keeps the fields wandering off their base paths
    // without a per-pixel program.
    fun warp(x: Float, y: Float) = Offset(
        (sin(y * 5.1f + t * 0.16f) + cos((x + y) * 3.7f - t * 0.11f)) * 0.10f,
        (cos(x * 4.3f - t * 0.13f) + sin((x - y) * 4.9f + t * 0.18f)) * 0.10f,
    )

    val anchorA = Offset(
        0.24f + sin(t * 0.14f) * 0.24f + cos(t * 0.05f) * 0.07f,
        0.26f + cos(t * 0.11f) * 0.21f,
    )
    val anchorB = Offset(
        0.76f + cos(t * 0.09f + 1.7f) * 0.22f,
        0.36f + sin(t * 0.16f + 0.8f) * 0.25f,
    )
    val anchorC = Offset(
        0.50f + sin(t * 0.12f + 3.1f) * 0.30f,
        0.78f + cos(t * 0.08f + 2.2f) * 0.19f,
    )

    // Warp displaces the sampling grid, so the field appears to move the other
    // way — subtract it from the anchor.
    val wA = warp(anchorA.x, anchorA.y)
    val wB = warp(anchorB.x, anchorB.y)
    val wC = warp(anchorC.x, anchorC.y)

    drawRect(color = palette.base.toColor(alpha), size = size)
    drawField(palette.fieldA, anchorA - wA, 0.62f, 0.90f * alpha)
    drawField(palette.fieldB, anchorB - wB, 0.58f, 0.84f * alpha)
    drawField(palette.fieldC, anchorC - wC, 0.64f, 0.80f * alpha)
}

/** Edge falloff — the shader's `colour *= mix(1.0, 0.88, edge)`. */
private fun DrawScope.drawEdgeFalloff() {
    val maxDim = max(size.width, size.height)
    if (maxDim <= 0f) return
    val center = Offset(size.width / 2f, size.height / 2f)
    // `length(uv - 0.5)` reaches ~0.707 at the corners of a square canvas; the
    // falloff ramps between 0.28 and 0.78 of that space.
    val radius = hypot(size.width, size.height) / 2f
    drawRect(
        brush = Brush.radialGradient(
            colorStops = arrayOf(
                0f to Color.Transparent,
                0.40f to Color.Transparent,
                1f to Color.Black.copy(alpha = 0.12f),
            ),
            center = center,
            radius = radius,
        ),
        size = size,
    )
}

/**
 * Artwork-led animated background shared by both player presentations.
 *
 * @param animated false freezes the field (used when the player is idle, and
 *   honoured for reduced-motion the same way the RN component does).
 */
@Composable
fun ArtworkFlowBackground(
    coverUri: String?,
    modifier: Modifier = Modifier,
    animated: Boolean = true,
) {
    val context = LocalContext.current

    var frontPalette by remember { mutableStateOf(DefaultFlowPalette) }
    var backPalette by remember { mutableStateOf<FlowPalette?>(null) }
    val transition = remember { Animatable(1f) }

    // Resolve the cover, then cross-fade from whatever is on screen. The
    // outgoing palette is held until the fade completes so a track change never
    // shows a frame with neither layer drawn — that black flash is what made a
    // change look like the background blinking out and snapping back in.
    LaunchedEffect(coverUri) {
        val resolved = extractFlowPalette(context, coverUri) ?: return@LaunchedEffect
        if (resolved == frontPalette) return@LaunchedEffect
        backPalette = frontPalette
        frontPalette = resolved
        transition.snapTo(0f)
        transition.animateTo(
            targetValue = 1f,
            animationSpec = tween(TRACK_CHANGE_MS, easing = PlayerTokens.EaseInOutSine),
        )
        backPalette = null
    }

    // Master clock. Divisor is the speed control — smaller is faster. At 285 the
    // drift was too slow to read as motion at all and the blobs looked like a
    // static gradient. 165 makes the shapes visibly travel while staying calm
    // enough to sit behind lyrics without pulling the eye.
    val time = remember { mutableFloatStateOf(0f) }
    LaunchedEffect(animated) {
        if (!animated) return@LaunchedEffect
        var last = withFrameNanos { it }
        while (true) {
            val now = withFrameNanos { it }
            time.floatValue += (now - last) / 1_000_000f / 165f
            last = now
        }
    }

    BoxWithConstraints(modifier = modifier) {
        // A 30 dp blur is gorgeous on a lyric sheet but turns a 50 dp island
        // into a single flat swatch. Scale it to the actual surface so compact
        // presentations keep visible moving colour shapes.
        val blurRadius: Dp = min(FLOW_BLUR.value, max(6f, maxHeight.value * 0.16f)).dp

        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .matchParentSize()
                .blur(blurRadius, BlurredEdgeTreatment.Rectangle)
                .drawBehind {
                    val t = time.floatValue
                    val progress = transition.value
                    backPalette?.let { drawFlowLayer(it, t, 1f - progress) }
                    drawFlowLayer(frontPalette, t, progress)
                    drawEdgeFalloff()
                }
        )
    }
}
