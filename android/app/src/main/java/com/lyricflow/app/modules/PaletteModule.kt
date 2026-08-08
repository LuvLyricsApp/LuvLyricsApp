package com.lyricflow.app.modules

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import androidx.palette.graphics.Palette
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class PaletteModule : Module() {

    // Cache up to 50 URI→JSON results so repeat plays don't re-decode the bitmap
    private val cache = LruCache<String, String>(50)

    override fun definition() = ModuleDefinition {
        Name("Palette")

        // Returns JSON: { dominant, vibrant, darkVibrant, muted, darkMuted, lightVibrant }
        // Each present swatch: { color: "#RRGGBB", titleTextColor: "#RRGGBB", bodyTextColor: "#RRGGBB" }
        // Absent swatches are omitted. Returns null string on any failure.
        AsyncFunction("extractColors") { imageUri: String ->
            if (imageUri.isBlank()) return@AsyncFunction null

            cache.get(imageUri)?.let { return@AsyncFunction it }

            try {
                val bitmap = decodeBitmap(imageUri) ?: return@AsyncFunction null
                val palette = Palette.from(bitmap).generate()
                val json = buildJson(palette)
                cache.put(imageUri, json)
                json
            } catch (_: Exception) {
                null
            }
        }
    }

    private fun decodeBitmap(uriStr: String): Bitmap? {
        val context = appContext.reactContext ?: return null
        val opts = BitmapFactory.Options().apply { inSampleSize = 4 }
        return try {
            val uri = Uri.parse(uriStr)
            val scheme = uri.scheme
            if (scheme == "file" || scheme == null) {
                BitmapFactory.decodeFile(uri.path, opts)
            } else {
                context.contentResolver.openInputStream(uri)?.use { stream ->
                    BitmapFactory.decodeStream(stream, null, opts)
                }
            }
        } catch (_: Exception) { null }
    }

    private fun buildJson(palette: Palette): String {
        val root = JSONObject()
        palette.dominantSwatch?.let      { root.put("dominant",     swatchJson(it)) }
        palette.vibrantSwatch?.let       { root.put("vibrant",      swatchJson(it)) }
        palette.darkVibrantSwatch?.let   { root.put("darkVibrant",  swatchJson(it)) }
        palette.mutedSwatch?.let         { root.put("muted",        swatchJson(it)) }
        palette.darkMutedSwatch?.let     { root.put("darkMuted",    swatchJson(it)) }
        palette.lightVibrantSwatch?.let  { root.put("lightVibrant", swatchJson(it)) }
        return root.toString()
    }

    private fun swatchJson(swatch: Palette.Swatch): JSONObject {
        val o = JSONObject()
        o.put("color",          colorHex(swatch.rgb))
        o.put("titleTextColor", colorHex(swatch.titleTextColor))
        o.put("bodyTextColor",  colorHex(swatch.bodyTextColor))
        o.put("population",     swatch.population)
        return o
    }

    private fun colorHex(color: Int): String =
        String.format("#%06X", 0xFFFFFF and color)
}
