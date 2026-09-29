package com.lyricflow.app.startup

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object StartupPreloader {
    @Volatile private var result: String? = null
    // Released when the preload thread finishes (or fails), so a waiter wakes at
    // that instant instead of polling for it.
    private val finished = CountDownLatch(1)

    fun preload(context: Context) {
        Thread {
            try {
                val dbFile = context.getDatabasePath("lyricflow.db")
                if (!dbFile.exists()) return@Thread
                val db = SQLiteDatabase.openDatabase(
                    dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY
                )
                result = buildJson(db)
                db.close()
            } catch (_: Exception) {
                // On any failure JS falls back to the normal init path
            } finally {
                finished.countDown()
            }
        }.apply { isDaemon = true; start() }
    }

    fun waitForResult(timeoutMs: Long = 3000L): String? {
        finished.await(timeoutMs, TimeUnit.MILLISECONDS)
        return result
    }

    private fun buildJson(db: SQLiteDatabase): String {
        val root = JSONObject()

        // Songs
        val songs = JSONArray()
        db.rawQuery("SELECT * FROM songs WHERE is_hidden = 0 ORDER BY date_created DESC", null).use { c ->
            val colId          = c.getColumnIndex("id")
            val colTitle       = c.getColumnIndex("title")
            val colArtist      = c.getColumnIndex("artist")
            val colAlbum       = c.getColumnIndex("album")
            val colGradient    = c.getColumnIndex("gradient_id")
            val colDuration    = c.getColumnIndex("duration")
            val colCreated     = c.getColumnIndex("date_created")
            val colModified    = c.getColumnIndex("date_modified")
            val colPlayCount   = c.getColumnIndex("play_count")
            val colLastPlayed  = c.getColumnIndex("last_played")
            val colScrollSpeed = c.getColumnIndex("scroll_speed")
            val colCoverUri    = c.getColumnIndex("cover_image_uri")
            val colLyricsAlign = c.getColumnIndex("lyrics_align")
            val colTextCase    = c.getColumnIndex("text_case")
            val colAudioUri    = c.getColumnIndex("audio_uri")
            val colIsLiked     = c.getColumnIndex("is_liked")

            while (c.moveToNext()) {
                val s = JSONObject()
                s.put("id",           safeStr(c, colId) ?: continue)
                s.put("title",        safeStr(c, colTitle) ?: "")
                s.put("artist",       safeStrOrNull(c, colArtist))
                s.put("album",        safeStrOrNull(c, colAlbum))
                s.put("gradientId",   safeStr(c, colGradient) ?: "blue")
                s.put("duration",     if (colDuration >= 0) c.getInt(colDuration) else 0)
                s.put("dateCreated",  safeStr(c, colCreated) ?: "")
                s.put("dateModified", safeStr(c, colModified) ?: "")
                s.put("playCount",    if (colPlayCount >= 0) c.getInt(colPlayCount) else 0)
                s.put("lastPlayed",   safeStrOrNull(c, colLastPlayed))
                s.put("scrollSpeed",  if (colScrollSpeed >= 0) c.getInt(colScrollSpeed) else 50)
                s.put("coverImageUri",safeStrOrNull(c, colCoverUri))
                s.put("lyricsAlign",  safeStr(c, colLyricsAlign) ?: "left")
                s.put("textCase",     safeStr(c, colTextCase) ?: "titlecase")
                s.put("audioUri",     safeStrOrNull(c, colAudioUri))
                s.put("isLiked",      if (colIsLiked >= 0 && !c.isNull(colIsLiked)) c.getInt(colIsLiked) == 1 else false)
                s.put("isHidden",     false)
                s.put("lyrics",       JSONArray())
                songs.put(s)
            }
        }
        root.put("songs", songs)

        // Playlists with song count
        val playlists = JSONArray()
        db.rawQuery(
            "SELECT p.id, p.name, p.description, p.cover_image_uri, p.is_default, p.sort_order, " +
            "p.date_created, p.date_modified, " +
            "(SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) AS song_count " +
            "FROM playlists p ORDER BY p.sort_order ASC",
            null
        ).use { c ->
            while (c.moveToNext()) {
                val p = JSONObject()
                p.put("id",           c.getString(0) ?: "")
                p.put("name",         c.getString(1) ?: "")
                p.put("description",  if (!c.isNull(2)) c.getString(2) else JSONObject.NULL)
                p.put("coverImageUri",if (!c.isNull(3)) c.getString(3) else JSONObject.NULL)
                p.put("isDefault",    c.getInt(4) == 1)
                p.put("sortOrder",    c.getInt(5))
                p.put("dateCreated",  c.getString(6) ?: "")
                p.put("dateModified", c.getString(7) ?: "")
                p.put("songCount",    c.getInt(8))
                playlists.put(p)
            }
        }
        root.put("playlists", playlists)

        // Last played song ID
        db.rawQuery(
            "SELECT id FROM songs WHERE last_played IS NOT NULL ORDER BY last_played DESC LIMIT 1",
            null
        ).use { c ->
            if (c.moveToNext() && !c.isNull(0)) root.put("lastPlayedId", c.getString(0))
        }

        return root.toString()
    }

    private fun safeStr(c: android.database.Cursor, col: Int): String? =
        if (col >= 0 && !c.isNull(col)) c.getString(col) else null

    private fun safeStrOrNull(c: android.database.Cursor, col: Int): Any =
        if (col >= 0 && !c.isNull(col)) c.getString(col) else JSONObject.NULL
}
