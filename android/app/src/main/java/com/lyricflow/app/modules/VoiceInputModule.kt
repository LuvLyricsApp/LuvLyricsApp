package com.lyricflow.app.modules

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.Locale

class VoiceInputModule : Module() {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val mainHandler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null

    override fun definition() = ModuleDefinition {
        Name("VoiceInput")

        Events("onStart", "onResult", "onPartialResult", "onAudioLevel", "onEnd", "onError")

        AsyncFunction("startListening") {
            scope.launch {
                val context = appContext.reactContext ?: run {
                    sendEvent("onError", mapOf("code" to "no_context", "message" to "React context unavailable"))
                    return@launch
                }

                if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                    sendEvent("onError", mapOf("code" to "not_available", "message" to "Speech recognition not available on this device"))
                    return@launch
                }

                recognizer?.destroy()
                recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
                    setRecognitionListener(object : RecognitionListener {
                        override fun onReadyForSpeech(params: Bundle?) {
                            sendEvent("onStart", emptyMap<String, Any>())
                        }

                        override fun onBeginningOfSpeech() {}

                        override fun onRmsChanged(rmsdB: Float) {
                            // Normalize typical range -2..10 dB to 0..1
                            val level = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
                            sendEvent("onAudioLevel", mapOf("level" to level))
                        }

                        override fun onBufferReceived(buffer: ByteArray?) {}

                        override fun onEndOfSpeech() {}

                        override fun onError(error: Int) {
                            val code = when (error) {
                                SpeechRecognizer.ERROR_AUDIO -> "audio_error"
                                SpeechRecognizer.ERROR_CLIENT -> "client_error"
                                SpeechRecognizer.ERROR_NO_MATCH -> "no_match"
                                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "timeout"
                                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
                                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission_denied"
                                SpeechRecognizer.ERROR_NETWORK -> "network_error"
                                else -> "error_$error"
                            }
                            sendEvent("onError", mapOf("code" to code))
                            sendEvent("onEnd", mapOf("transcript" to ""))
                        }

                        override fun onResults(results: Bundle?) {
                            val transcript = results
                                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                ?.firstOrNull() ?: ""
                            sendEvent("onResult", mapOf("transcript" to transcript))
                            sendEvent("onEnd", mapOf("transcript" to transcript))
                        }

                        override fun onPartialResults(results: Bundle?) {
                            val partial = results
                                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                ?.firstOrNull() ?: ""
                            if (partial.isNotEmpty()) {
                                sendEvent("onPartialResult", mapOf("transcript" to partial))
                            }
                        }

                        override fun onEvent(eventType: Int, params: Bundle?) {}
                    })
                }

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    // Stop listening 1.5s after silence
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1000L)
                }
                recognizer?.startListening(intent)
            }
        }

        AsyncFunction("stopListening") {
            scope.launch {
                recognizer?.stopListening()
            }
        }

        AsyncFunction("cancelListening") {
            scope.launch {
                recognizer?.cancel()
                recognizer?.destroy()
                recognizer = null
                sendEvent("onEnd", mapOf("transcript" to ""))
            }
        }

        OnDestroy {
            recognizer?.destroy()
            recognizer = null
        }
    }
}
