package com.lyricflow.app.compose.player

import com.lyricflow.app.data.LyricLineEntity
import com.lyricflow.app.data.SongWithLyrics

/**
 * Kotlin port of the RN lyrics pipeline (src/services/LyricaService.ts +
 * src/database/queries.ts).
 *
 * The contract this preserves, per ROADMAP Phase 3: word timings are re-attached
 * from the **locally stored** provider payload, so rich-sync highlighting works
 * offline and playback never re-hits Unison or Better Lyrics. Nothing in this
 * file touches the network.
 *
 * Priority is unchanged from the RN app: rich-sync / word-timed first, then
 * line-sync, then plain.
 */

/** Per-word timing for rich-sync / TTML karaoke highlight. Seconds. */
data class LyricWord(
    val text: String,
    val startTime: Double,
    val endTime: Double,
)

data class LyricLine(
    /** Seconds. */
    val timestamp: Double,
    val text: String,
    val lineOrder: Int,
    /** Present when the source was word-timed. */
    val words: List<LyricWord> = emptyList(),
    /** TTML background-vocal line (`{bg}` marker), kept for styling. */
    val isBackground: Boolean = false,
)

/** How precisely a song's lyrics are timed — drives what the stage renders. */
enum class LyricsSync { NONE, PLAIN, LINE, WORD }

data class SongLyrics(
    val lines: List<LyricLine>,
    val sync: LyricsSync,
    /** Per-song correction, seconds. Stacks on the global delay. */
    val offset: Double,
) {
    val isEmpty: Boolean get() = lines.isEmpty()

    companion object {
        val Empty = SongLyrics(emptyList(), LyricsSync.NONE, 0.0)
    }
}

private val TIME_REGEX = Regex("""\[(\d{2}):(\d{2})\.(\d{2,3})]""")
private val WORD_LINE_REGEX = Regex("""^<([^>\n]+)>$""")
private val INLINE_WORD_REGEX = Regex("""<(\d{1,2}):(\d{2})\.(\d{2,3})>([^<]*)""")
private val P_REGEX = Regex("""<p\b([^>]*)>([\s\S]*?)</p>""", RegexOption.IGNORE_CASE)
private val SPAN_REGEX = Regex("""<span\b([^>]*)>([\s\S]*?)</span>""", RegexOption.IGNORE_CASE)
private val BACKGROUND_REGEX =
    Regex("""<span\b([^>]*)ttm:role="x-bg"([^>]*)>([\s\S]*?)</span>""", RegexOption.IGNORE_CASE)
private val TAG_REGEX = Regex("""<[^>]+>""")
private val TTML_HEAD_REGEX = Regex("""^\s*<tt[\s>]""", RegexOption.IGNORE_CASE)
private val ENHANCED_LRC_PROBE = Regex("""<\d{1,2}:\d{2}\.\d{2,3}>""")

private fun decodeXmlEntities(value: String): String = value
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&apos;", "'")
    .replace("&#39;", "'")
    .replace("&nbsp;", " ")
    // Ampersand last so the replacements above are not re-decoded.
    .replace("&amp;", "&")

private fun stripXmlTags(value: String): String =
    decodeXmlEntities(value.replace(TAG_REGEX, " ")).replace(Regex("""\s+"""), " ").trim()

private fun looksLikeTtml(value: String): Boolean = TTML_HEAD_REGEX.containsMatchIn(value)

private fun parseTtmlTime(value: String): Double {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) return 0.0
    val parts = trimmed.split(":").map { it.trim() }
    return when (parts.size) {
        3 -> (parts[0].toDoubleOrNull() ?: 0.0) * 3600 +
            (parts[1].toDoubleOrNull() ?: 0.0) * 60 +
            (parts[2].toDoubleOrNull() ?: 0.0)
        2 -> (parts[0].toDoubleOrNull() ?: 0.0) * 60 + (parts[1].toDoubleOrNull() ?: 0.0)
        else -> trimmed.toDoubleOrNull() ?: 0.0
    }
}

private fun extractAttr(attrs: String, name: String): String? =
    Regex("""${Regex.escape(name)}="([^"]+)"""", RegexOption.IGNORE_CASE)
        .find(attrs)?.groupValues?.getOrNull(1)

private fun formatSeconds(value: Double): String =
    String.format("%.3f", value).trimEnd('0').trimEnd('.')

private fun formatLrcTimestamp(seconds: Double): String {
    val totalMs = maxOf(0L, Math.round(seconds * 1000))
    val minutes = totalMs / 60000
    val secs = (totalMs % 60000) / 1000
    val hundredths = (totalMs % 1000) / 10
    return "[%02d:%02d.%02d]".format(minutes, secs, hundredths)
}

private fun parseTtmlSpanWords(content: String): List<LyricWord> =
    SPAN_REGEX.findAll(content).mapNotNull { match ->
        val attrs = match.groupValues.getOrElse(1) { "" }
        val role = extractAttr(attrs, "ttm:role") ?: extractAttr(attrs, "role")
        if (role == "x-bg" || role == "x-translation" || role == "x-roman") return@mapNotNull null

        val begin = extractAttr(attrs, "begin") ?: return@mapNotNull null
        val end = extractAttr(attrs, "end") ?: return@mapNotNull null
        val text = stripXmlTags(match.groupValues.getOrElse(2) { "" })
        if (text.isEmpty()) return@mapNotNull null

        LyricWord(text, parseTtmlTime(begin), parseTtmlTime(end))
    }.toList()

/**
 * TTML → the app's internal LRC dialect: a normal `[mm:ss.xx]text` line, then
 * an optional `<word:start:end|...>` row carrying that line's word timings.
 * Background vocals get their own line prefixed `{bg}`.
 */
fun convertTtmlToInternalLrc(ttml: String): String {
    val out = mutableListOf<String>()

    for (match in P_REGEX.findAll(ttml)) {
        val attrs = match.groupValues.getOrElse(1) { "" }
        val inner = match.groupValues.getOrElse(2) { "" }
        val begin = extractAttr(attrs, "begin") ?: continue

        val backgroundChunks = BACKGROUND_REGEX.findAll(inner).toList()
        val mainInner = inner.replace(BACKGROUND_REGEX, " ")
        val words = parseTtmlSpanWords(mainInner)
        val lineText = if (words.isNotEmpty()) {
            words.joinToString(" ") { it.text }
        } else {
            stripXmlTags(mainInner)
        }
        if (lineText.isEmpty()) continue

        out += "${formatLrcTimestamp(parseTtmlTime(begin))}$lineText"
        if (words.isNotEmpty()) {
            out += "<" + words.joinToString("|") {
                "${it.text}:${formatSeconds(it.startTime)}:${formatSeconds(it.endTime)}"
            } + ">"
        }

        for (chunk in backgroundChunks) {
            val bgInner = chunk.groupValues.getOrElse(3) { "" }
            val bgWords = parseTtmlSpanWords(bgInner)
            val bgText = if (bgWords.isNotEmpty()) {
                bgWords.joinToString(" ") { it.text }
            } else {
                stripXmlTags(bgInner)
            }
            if (bgText.isEmpty()) continue

            val bgBegin = bgWords.firstOrNull()?.startTime ?: parseTtmlTime(begin)
            out += "${formatLrcTimestamp(bgBegin)}{bg}$bgText"
            if (bgWords.isNotEmpty()) {
                out += "<" + bgWords.joinToString("|") {
                    "${it.text}:${formatSeconds(it.startTime)}:${formatSeconds(it.endTime)}"
                } + ">"
            }
        }
    }

    return out.joinToString("\n")
}

/** `text:start:end|text:start:end` — text may contain colons, times are the last two fields. */
fun parseInternalWordTiming(payload: String): List<LyricWord> {
    if (payload.isBlank()) return emptyList()
    return payload.split("|").mapNotNull { rawChunk ->
        val chunk = rawChunk.trim()
        if (chunk.isEmpty()) return@mapNotNull null
        val parts = chunk.split(":")
        if (parts.size < 3) return@mapNotNull null
        val end = parts.last().toDoubleOrNull() ?: return@mapNotNull null
        val start = parts[parts.size - 2].toDoubleOrNull() ?: return@mapNotNull null
        val text = parts.subList(0, parts.size - 2).joinToString(":").trim()
        if (text.isEmpty()) return@mapNotNull null
        LyricWord(text, start, end)
    }
}

/**
 * Parses the internal LRC dialect. Handles three shapes:
 *   · `[mm:ss.xx]text` line-synced
 *   · trailing `<word:start:end|...>` rows from [convertTtmlToInternalLrc]
 *   · enhanced/A2 LRC inline stamps `<mm:ss.xx>word` on the line itself
 *
 * With no timestamps at all it falls back to spreading the lines evenly across
 * `duration`, which is what makes plain lyrics still auto-scroll.
 */
fun parseLrc(content: String, duration: Double = 180.0): List<LyricLine> {
    if (content.isEmpty()) return emptyList()

    val rawLines = content.split("\n")
    val result = mutableListOf<LyricLine>()
    val hasTimestamps = rawLines.any { TIME_REGEX.containsMatchIn(it) }
    val safeDuration = if (duration > 0) duration else 180.0

    if (hasTimestamps) {
        rawLines.forEachIndexed { index, line ->
            val trimmed = line.trim()

            // A word-timing row belongs to the line above it.
            val wordMatch = WORD_LINE_REGEX.find(trimmed)
            if (wordMatch != null && result.isNotEmpty()) {
                val words = parseInternalWordTiming(wordMatch.groupValues[1])
                if (words.isNotEmpty()) {
                    result[result.lastIndex] = result.last().copy(words = words)
                }
                return@forEachIndexed
            }

            val match = TIME_REGEX.find(line) ?: return@forEachIndexed
            val minutes = match.groupValues[1].toInt()
            val seconds = match.groupValues[2].toInt()
            val millis = match.groupValues[3].padEnd(3, '0').toInt()
            val timestamp = minutes * 60 + seconds + millis / 1000.0

            var text = line.replace(TIME_REGEX, "").trim()

            // Inline enhanced-LRC word stamps on the same line as the timestamp.
            val inline = INLINE_WORD_REGEX.findAll(text).mapNotNull { wordMatchInline ->
                val wMin = wordMatchInline.groupValues[1].toInt()
                val wSec = wordMatchInline.groupValues[2].toInt()
                val wMs = wordMatchInline.groupValues[3].padEnd(3, '0').toInt()
                val start = wMin * 60 + wSec + wMs / 1000.0
                val wordText = wordMatchInline.groupValues[4].trim()
                if (wordText.isEmpty()) null else LyricWord(wordText, start, start)
            }.toMutableList()

            if (inline.isNotEmpty()) {
                // Close each word at the next word's start; the last stays open
                // for two seconds, matching the RN parser.
                for (i in 0 until inline.size - 1) {
                    inline[i] = inline[i].copy(endTime = inline[i + 1].startTime)
                }
                inline[inline.lastIndex] =
                    inline.last().copy(endTime = inline.last().startTime + 2)
                text = inline.joinToString(" ") { it.text }
            }

            if (text.isEmpty()) text = "[INSTRUMENTAL]"

            val isBackground = text.startsWith("{bg}")
            if (isBackground) text = text.substring(4)

            result += LyricLine(
                timestamp = timestamp,
                text = text,
                lineOrder = index,
                words = inline,
                isBackground = isBackground,
            )
        }
    } else {
        val meaningful = rawLines
            .map { it.trim() }
            .filter { it.isNotEmpty() && !WORD_LINE_REGEX.matches(it) }
        if (meaningful.isNotEmpty()) {
            val perLine = safeDuration / meaningful.size
            meaningful.forEachIndexed { index, text ->
                result += LyricLine(timestamp = index * perLine, text = text, lineOrder = index)
            }
        }
    }

    return result.mapIndexed { index, line -> line.copy(lineOrder = index) }
}

/**
 * Builds the render-ready lyrics for a song from Room, re-attaching word
 * timings from the stored provider payload.
 *
 * Mirrors `hydrateLyricsWithWordTimings`: the stored line rows are the baseline,
 * and the rich payload only wins when it actually parses into word-timed lines.
 * A payload that yields nothing never blanks out working line-synced lyrics.
 */
fun buildSongLyrics(songWithLyrics: SongWithLyrics): SongLyrics {
    val song = songWithLyrics.song
    val baseline = songWithLyrics.lyrics
        .sortedBy { it.lineOrder }
        .mapIndexed { index, row: LyricLineEntity ->
            LyricLine(
                // Stored as fractional seconds — see LyricLineEntity.timestamp.
                timestamp = row.timestamp,
                text = row.text,
                lineOrder = index,
            )
        }

    val duration = if (song.duration > 0) song.duration.toDouble() else 180.0
    val raw = song.lyricsRaw

    val hydrated = hydrate(
        baseline = baseline,
        raw = raw,
        format = song.lyricsFormat,
        syncType = song.lyricsSyncType,
        precision = song.lyricsPrecision,
        duration = duration,
    )

    val sync = when {
        hydrated.isEmpty() -> LyricsSync.NONE
        hydrated.any { it.words.isNotEmpty() } -> LyricsSync.WORD
        hydrated.any { it.timestamp > 0.0 } -> LyricsSync.LINE
        else -> LyricsSync.PLAIN
    }

    return SongLyrics(lines = hydrated, sync = sync, offset = song.lyricsOffset)
}

private fun hydrate(
    baseline: List<LyricLine>,
    raw: String?,
    format: String?,
    syncType: String?,
    precision: String?,
    duration: Double,
): List<LyricLine> {
    if (raw.isNullOrBlank()) return baseline
    if (baseline.any { it.words.isNotEmpty() }) return baseline

    val hasInternalWordRows = raw.split(Regex("\r?\n")).any { line ->
        val trimmed = line.trim()
        WORD_LINE_REGEX.matches(trimmed) && trimmed.contains("|") && trimmed.contains(":")
    }
    val isRich = precision.equals("word", ignoreCase = true) ||
        syncType.equals("richsync", ignoreCase = true) ||
        format.equals("ttml", ignoreCase = true) ||
        looksLikeTtml(raw) ||
        hasInternalWordRows ||
        ENHANCED_LRC_PROBE.containsMatchIn(raw)

    if (!isRich) return baseline

    val content = if (looksLikeTtml(raw) || format.equals("ttml", ignoreCase = true)) {
        convertTtmlToInternalLrc(raw)
    } else {
        raw
    }

    val parsed = parseLrc(content, duration)
    if (parsed.isEmpty()) return baseline
    if (parsed.none { it.words.isNotEmpty() }) return baseline

    // Prefer the re-parsed rich lines (timestamps + words) so the highlight
    // stays coherent with the timings it came from.
    return parsed
}

/**
 * Index of the line active at `positionSec`, or -1 before the first line.
 * `offset` is the per-song correction plus any global delay, in seconds.
 */
fun List<LyricLine>.activeLineIndex(positionSec: Double, offset: Double = 0.0): Int {
    if (isEmpty()) return -1
    val t = positionSec + offset
    // Lines are sorted by timestamp; walk back from the end.
    for (i in indices.reversed()) {
        if (t >= this[i].timestamp) return i
    }
    return -1
}

/**
 * How far through the active word the clock is, for the karaoke sweep.
 * Returns the word index and its 0..1 progress, or null when between words.
 */
fun LyricLine.activeWord(positionSec: Double, offset: Double = 0.0): Pair<Int, Float>? {
    if (words.isEmpty()) return null
    val t = positionSec + offset
    for ((index, word) in words.withIndex()) {
        if (t < word.startTime) return index to 0f
        if (t <= word.endTime) {
            val span = (word.endTime - word.startTime).takeIf { it > 0.0 } ?: return index to 1f
            return index to ((t - word.startTime) / span).toFloat().coerceIn(0f, 1f)
        }
    }
    return words.lastIndex to 1f
}
