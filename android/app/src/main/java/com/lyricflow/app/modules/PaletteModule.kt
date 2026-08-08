package com.lyricflow.app.modules

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import androidx.palette.graphics.Palette
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class PaletteModule : Module() {

    // Cache up to 50 URI→JSON results so repeat plays don't re-decode the bitmap
    private val cache = LruCache<String, String>(50)

    override fun definition() = ModuleDefinition {
        Name("Palette")

        // Returns JSON: { swatches, dominant, vibrant, darkVibrant, muted, darkMuted, lightVibrant }
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
            when (scheme) {
                "file", null -> BitmapFactory.decodeFile(uri.path, opts)
                "http", "https" -> {
                    // Some legacy downloads retain the remote artwork URL when
                    // their cover file was unavailable. ContentResolver cannot
                    // open those URLs, which previously made them fall back to
                    // the generic blue song gradient.
                    val connection = (URL(uriStr).openConnection() as HttpURLConnection).apply {
                        connectTimeout = 4_000
                        readTimeout = 6_000
                        instanceFollowRedirects = true
                    }
                    try {
                        connection.inputStream.use { stream ->
                            BitmapFactory.decodeStream(stream, null, opts)
                        }
                    } finally {
                        connection.disconnect()
                    }
                }
                else -> context.contentResolver.openInputStream(uri)?.use { stream ->
                    BitmapFactory.decodeStream(stream, null, opts)
                }
            }
        } catch (_: Exception) { null }
    }

    private fun buildJson(palette: Palette): String {
        val root = JSONObject()
        val swatches = JSONArray()
        palette.swatches.forEach { swatches.put(swatchJson(it)) }
        root.put("swatches", swatches)
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
