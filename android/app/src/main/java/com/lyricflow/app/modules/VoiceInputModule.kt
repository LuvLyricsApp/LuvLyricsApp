package com.lyricflow.app.modules

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
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
                    sendError("no_context", "React context unavailable")
                    return@launch
                }

                if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                    sendError("not_available", "Speech recognition not available on this device")
                    return@launch
                }

                recognizer?.destroy()
                val newRecognizer = SpeechRecognizer.createSpeechRecognizer(context)

                if (newRecognizer == null) {
                    sendError("not_available", "Failed to create SpeechRecognizer instance")
                    return@launch
                }

                recognizer = newRecognizer.apply {
                    setRecognitionListener(object : RecognitionListener {
                        override fun onReadyForSpeech(params: Bundle?) {
                            sendEvent("onStart", emptyMap<String, Any>())
                        }

                        override fun onBeginningOfSpeech() {}

                        override fun onRmsChanged(rmsdB: Float) {
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
                                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "timeout"
                                else -> "error_$error"
                            }
                            Log.w("VoiceInput", "SpeechRecognizer error: $code ($error)")
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
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1000L)
                }
                recognizer?.startListening(intent)
            }
        }

        AsyncFunction("stopListening") {
            scope.launch {
                try {
                    recognizer?.stopListening()
                } catch (e: Exception) {
                    Log.w("VoiceInput", "stopListening failed: ${e.message}")
                }
            }
        }

        AsyncFunction("cancelListening") {
            scope.launch {
                try {
                    recognizer?.cancel()
                    recognizer?.destroy()
                } catch (e: Exception) {
                    Log.w("VoiceInput", "cancelListening failed: ${e.message}")
                }
                recognizer = null
                sendEvent("onEnd", mapOf("transcript" to ""))
            }
        }

        OnDestroy {
            try {
                recognizer?.destroy()
            } catch (_: Exception) {}
            recognizer = null
        }
    }

    private fun sendError(code: String, message: String) {
        Log.e("VoiceInput", "Error: $code — $message")
        sendEvent("onError", mapOf("code" to code, "message" to message))
        sendEvent("onEnd", mapOf("transcript" to ""))
    }
}
