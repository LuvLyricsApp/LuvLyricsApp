package com.lyricflow.app.modules

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import com.lyricflow.app.startup.StartupPreloader
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StartupModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("Startup")

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
    }
}
