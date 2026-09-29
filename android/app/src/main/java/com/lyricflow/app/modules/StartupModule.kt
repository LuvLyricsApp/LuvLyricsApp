package com.lyricflow.app.modules

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.lyricflow.app.startup.StartupPreloader
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StartupModule : Module() {
    private var powerReceiver: BroadcastReceiver? = null

    private fun powerSaveOn(context: Context?): Boolean =
        (context?.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isPowerSaveMode ?: false

    override fun definition() = ModuleDefinition {
        Name("Startup")

        Events("onPowerSaveChanged")

        // Called from JS once during App.tsx initialize().
        // Blocks the background thread until the preloader finishes (usually < 5ms).
        AsyncFunction("getPreloadedData") {
            StartupPreloader.waitForResult()
        }

        // What the phone can take: JS picks lighter visuals on low-end devices
        // (see src/utils/performanceTier.ts). Cheap and synchronous.
        Function("deviceProfile") {
            val context = appContext.reactContext
            val am = context?.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            val info = ActivityManager.MemoryInfo().also { am?.getMemoryInfo(it) }
            mapOf(
                "totalMemMb" to (info.totalMem / (1024 * 1024)).toInt(),
                "lowRam" to (am?.isLowRamDevice ?: false),
                "cores" to Runtime.getRuntime().availableProcessors(),
                "apiLevel" to Build.VERSION.SDK_INT,
            )
        }

        // Battery Saver: the shader and glows step down while it is on
        // (see src/utils/visualBudget.ts). `onPowerSaveChanged` keeps JS current.
        Function("isPowerSaveMode") {
            powerSaveOn(appContext.reactContext)
        }

        OnCreate {
            val context = appContext.reactContext ?: return@OnCreate
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context?, intent: Intent?) {
                    sendEvent("onPowerSaveChanged", mapOf("enabled" to powerSaveOn(context)))
                }
            }
            powerReceiver = receiver
            ContextCompat.registerReceiver(
                context,
                receiver,
                IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
        }

        OnDestroy {
            val receiver = powerReceiver ?: return@OnDestroy
            try {
                appContext.reactContext?.unregisterReceiver(receiver)
            } catch (_: IllegalArgumentException) {
                // Already unregistered.
            }
            powerReceiver = null
        }
    }
}
