package com.lyricflow.app.workers

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class DownloadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val id = inputData.getString("id") ?: return Result.failure()
        val audioUrl = inputData.getString("audioUrl") ?: return Result.failure()
        val coverUrl = inputData.getString("coverUrl")
        val rawSongDir = inputData.getString("songDir") ?: return Result.failure()
        val lyrics = inputData.getString("lyrics")
        val safDir = inputData.getString("safDir")

        // Expo's FileSystem.documentDirectory returns a file:// URI; File() needs a plain path
        val songDirStr = Uri.parse(rawSongDir).path ?: rawSongDir
        val songDir = File(songDirStr)
        if (!songDir.exists()) {
            songDir.mkdirs()
        }

        try {
            // 1. Download Audio
            val audioFile = File(songDir, "audio.mp3")
            downloadFile(audioUrl, audioFile, 0.1f, 0.7f)

            // 2. Download Cover if provided
            var finalCoverUri: String? = null
            if (!coverUrl.isNullOrEmpty()) {
                val coverFile = File(songDir, "cover.jpg")
                try {
                    downloadFile(coverUrl, coverFile, 0.8f, 0.1f)
                    finalCoverUri = coverFile.absolutePath
                } catch (_: Exception) {}
            }

            // 3. Write Lyrics if provided
            if (!lyrics.isNullOrEmpty()) {
                val lyricsFile = File(songDir, "lyrics.lrc")
                try {
                    lyricsFile.writeText(lyrics)
                } catch (_: Exception) {}
            }

            // 4. SAF Export if configured
            var finalAudioUri = audioFile.absolutePath
            if (!safDir.isNullOrEmpty()) {
                setProgress(workDataOf("progress" to 0.95f, "status" to "exporting"))
                try {
                    val safUri = copyToSaf(applicationContext, audioFile, safDir, id, "audio/mpeg")
                    finalAudioUri = safUri
                } catch (e: Exception) {
                    // Fallback to internal if SAF fails
                }
            }

            setProgress(workDataOf("progress" to 1.0f, "status" to "succeeded"))
            
            val outputData = workDataOf(
                "id" to id,
                "audioUri" to finalAudioUri,
                "coverUri" to finalCoverUri,
                "status" to "succeeded"
            )
            return Result.success(outputData)

        } catch (e: Exception) {
            // Clean up directory on failure
            try {
                songDir.deleteRecursively()
            } catch (_: Exception) {}
            
            setProgress(workDataOf("progress" to 0.0f, "status" to "failed"))
            return Result.failure(workDataOf("id" to id, "status" to "failed", "error" to e.message))
        }
    }

    private suspend fun downloadFile(urlStr: String, outputFile: File, progressStart: Float, progressRange: Float) {
        withContext(Dispatchers.IO) {
            var currentUrl = urlStr
            var conn: HttpURLConnection
            var redirects = 0
            while (true) {
                val url = URL(currentUrl)
                conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 30000
                conn.readTimeout = 60000
                conn.instanceFollowRedirects = false
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 12; SM-M315F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
                conn.setRequestProperty("Accept", "audio/*, */*")
                conn.setRequestProperty("Accept-Language", "en-US,en;q=0.9")
                conn.setRequestProperty("Referer", "https://www.jiosaavn.com/")
                conn.connect()

                val code = conn.responseCode
                if (code in 300..399) {
                    val location = conn.getHeaderField("Location")
                        ?: throw Exception("Redirect $code with no Location header")
                    conn.disconnect()
                    currentUrl = if (location.startsWith("http")) location else URL(URL(currentUrl), location).toString()
                    if (++redirects > 10) throw Exception("Too many redirects")
                    continue
                }
                if (code !in 200..299) {
                    conn.disconnect()
                    throw Exception("Server returned code $code for URL: ${currentUrl.take(120)}")
                }
                break
            }

            try {
                val fileLength = conn.contentLength
                conn.inputStream.use { input ->
                    FileOutputStream(outputFile).use { output ->
                        val data = ByteArray(16384)
                        var total: Long = 0
                        var count: Int
                        while (input.read(data).also { count = it } != -1) {
                            total += count
                            output.write(data, 0, count)
                            if (fileLength > 0) {
                                val progress = progressStart + (total.toFloat() / fileLength.toFloat()) * progressRange
                                setProgress(workDataOf("progress" to progress, "status" to "running"))
                            }
                        }
                    }
                }
            } finally {
                conn.disconnect()
            }
        }
    }

    private fun copyToSaf(context: Context, sourceFile: File, safDirUriStr: String, filename: String, mimeType: String): String {
        val contentResolver = context.contentResolver
        val safDirUri = Uri.parse(safDirUriStr)

        val parentId = DocumentsContract.getTreeDocumentId(safDirUri)
        val parentDocUri = DocumentsContract.buildDocumentUriUsingTree(safDirUri, parentId)
        val fileUri = DocumentsContract.createDocument(
            contentResolver,
            parentDocUri,
            mimeType,
            filename
        ) ?: throw Exception("Failed to create SAF document")

        contentResolver.openInputStream(Uri.fromFile(sourceFile)).use { input ->
            contentResolver.openOutputStream(fileUri).use { output ->
                if (input != null && output != null) {
                    input.copyTo(output)
                }
            }
        }
        return fileUri.toString()
    }
}
