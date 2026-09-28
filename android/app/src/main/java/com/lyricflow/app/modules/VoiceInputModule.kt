package com.lyricflow.app.modules

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

private const val TAG = "VoiceInput"
/** After the finger lifts, how long to wait for the recognizer's final text before using the live one. */
private const val RELEASE_GRACE_MS = 350L

/**
 * Hold-to-talk speech for voice search.
 *
 * - Runs on the phone when it can (Android 12+ on-device recognizer): no
 *   round trip, words appear as they are said. If the phone has no on-device
 *   model for the language it falls back to Google's recognizer once and
 *   remembers that for the rest of the session.
 * - Letting go is instant: the final text is awaited for at most
 *   RELEASE_GRACE_MS, otherwise the last partial result is the answer. The
 *   old flow waited for the server's final result, 1–6s after release.
 * - A release with nothing heard is "no_speech", not a failure; errors that
 *   arrive after words were already heard keep those words.
 * - Every callback is tied to its session, so a late event from a previous
 *   press can't end or answer the current one.
 */
class VoiceInputModule : Module() {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var recognizerOnDevice = false
    private var onDeviceUnusable = false

    private var session = 0
    private var listening = false
    private var releasing = false
    private var heardSpeech = false
    private var lastPartial = ""
    private var retriedBusy = false
    private val releaseTimeout = Runnable { finish(session, lastPartial) }

    override fun definition() = ModuleDefinition {
        Name("VoiceInput")

        Events("onStart", "onResult", "onPartialResult", "onAudioLevel", "onEnd", "onError")

        AsyncFunction("startListening") { main.post { start() } }

        AsyncFunction("stopListening") { main.post { release() } }

        AsyncFunction("cancelListening") {
            main.post {
                val wasListening = listening
                endSession()
                runCatching { recognizer?.cancel() }
                if (wasListening) sendEvent("onEnd", mapOf("transcript" to ""))
            }
        }

        OnDestroy {
            main.removeCallbacks(releaseTimeout)
            runCatching { recognizer?.destroy() }
            recognizer = null
        }
    }

    private fun context(): Context? = appContext.reactContext

    private fun canUseOnDevice(context: Context): Boolean =
        !onDeviceUnusable && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            runCatching { SpeechRecognizer.isOnDeviceRecognitionAvailable(context) }.getOrDefault(false)

    /** The recognizer to use, created once and reused while its kind still fits. */
    private fun recognizerFor(context: Context): SpeechRecognizer? {
        val wantOnDevice = canUseOnDevice(context)
        recognizer?.let { if (recognizerOnDevice == wantOnDevice) return it }
        runCatching { recognizer?.destroy() }
        recognizer = runCatching {
            if (wantOnDevice && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
            } else {
                SpeechRecognizer.createSpeechRecognizer(context)
            }
        }.getOrNull()
        recognizerOnDevice = wantOnDevice && recognizer != null
        Log.d(TAG, "recognizer ready (on device: $recognizerOnDevice)")
        return recognizer
    }

    private fun intent(): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        // A language tag string ("en-IN"); a Locale object here is ignored by some recognizers.
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, appContext.reactContext?.packageName)
        // Tap-to-talk ends on its own after a short silence; hold-to-talk ends on release.
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 900L)
    }

    private fun start() {
        val context = context() ?: return sendError("no_context")
        val available = SpeechRecognizer.isRecognitionAvailable(context) || canUseOnDevice(context)
        if (!available) return sendError("not_available")

        // A press while a previous one is still finishing: drop the old one.
        if (listening) runCatching { recognizer?.cancel() }
        main.removeCallbacks(releaseTimeout)
        session += 1
        listening = true
        releasing = false
        heardSpeech = false
        lastPartial = ""
        retriedBusy = false
        begin(context, session)
    }

    private fun begin(context: Context, mine: Int) {
        val r = recognizerFor(context) ?: return fail(mine, "not_available")
        r.setRecognitionListener(listenerFor(mine))
        runCatching { r.startListening(intent()) }.onFailure {
            Log.w(TAG, "startListening failed: ${it.message}")
            fail(mine, "audio_error")
        }
    }

    /** The finger lifted: stop recording, answer within RELEASE_GRACE_MS. */
    private fun release() {
        if (!listening || releasing) return
        releasing = true
        runCatching { recognizer?.stopListening() }
        main.postDelayed(releaseTimeout, RELEASE_GRACE_MS)
    }

    private fun listenerFor(mine: Int) = object : RecognitionListener {
        private fun current() = mine == session && listening

        override fun onReadyForSpeech(params: Bundle?) {
            if (current()) sendEvent("onStart", emptyMap<String, Any>())
        }

        override fun onBeginningOfSpeech() {
            if (current()) heardSpeech = true
        }

        override fun onRmsChanged(rmsdB: Float) {
            if (!current()) return
            val level = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
            sendEvent("onAudioLevel", mapOf("level" to level))
        }

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {}

        override fun onPartialResults(results: Bundle?) {
            if (!current()) return
            val partial = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
            if (partial.isNotBlank()) {
                heardSpeech = true
                lastPartial = partial
                sendEvent("onPartialResult", mapOf("transcript" to partial))
            }
        }

        override fun onResults(results: Bundle?) {
            if (!current()) return
            val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
            finish(mine, text.ifBlank { lastPartial })
        }

        override fun onError(error: Int) {
            if (!current()) return
            Log.w(TAG, "recognizer error $error (on device: $recognizerOnDevice)")
            // Words were already heard: the release (or a late hiccup) keeps them.
            if (lastPartial.isNotBlank()) return finish(mine, lastPartial)

            val context = context()
            val onDeviceGaveUp = recognizerOnDevice && error in ON_DEVICE_UNSUPPORTED
            if (onDeviceGaveUp && context != null && !releasing) {
                // No on-device model for this language: use Google's recognizer from now on.
                onDeviceUnusable = true
                return begin(context, mine)
            }
            if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY && !retriedBusy && context != null && !releasing) {
                retriedBusy = true
                runCatching { recognizer?.destroy() }
                recognizer = null
                return begin(context, mine)
            }
            fail(mine, codeFor(error))
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun codeFor(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_NO_MATCH,
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
        SpeechRecognizer.ERROR_CLIENT -> "no_speech"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission_denied"
        SpeechRecognizer.ERROR_NETWORK,
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
        SpeechRecognizer.ERROR_SERVER,
        11 -> "network_error"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
        SpeechRecognizer.ERROR_AUDIO -> "audio_error"
        12, 13, 14 -> "language_unavailable"
        else -> if (heardSpeech) "no_speech" else "error_$error"
    }

    private fun finish(mine: Int, transcript: String) {
        if (mine != session || !listening) return
        endSession()
        runCatching { recognizer?.cancel() }
        if (transcript.isBlank()) {
            sendEvent("onError", mapOf("code" to "no_speech"))
            sendEvent("onEnd", mapOf("transcript" to ""))
            return
        }
        sendEvent("onResult", mapOf("transcript" to transcript))
        sendEvent("onEnd", mapOf("transcript" to transcript))
    }

    private fun fail(mine: Int, code: String) {
        if (mine != session || !listening) return
        endSession()
        sendEvent("onError", mapOf("code" to code))
        sendEvent("onEnd", mapOf("transcript" to ""))
    }

    private fun endSession() {
        listening = false
        releasing = false
        main.removeCallbacks(releaseTimeout)
    }

    private fun sendError(code: String) {
        Log.w(TAG, "voice unavailable: $code")
        sendEvent("onError", mapOf("code" to code))
        sendEvent("onEnd", mapOf("transcript" to ""))
    }

    private companion object {
        // ERROR_LANGUAGE_NOT_SUPPORTED (12), ERROR_LANGUAGE_UNAVAILABLE (13),
        // ERROR_CANNOT_CHECK_SUPPORT (14), ERROR_SERVER_DISCONNECTED (11).
        val ON_DEVICE_UNSUPPORTED = setOf(11, 12, 13, 14)
    }
}
