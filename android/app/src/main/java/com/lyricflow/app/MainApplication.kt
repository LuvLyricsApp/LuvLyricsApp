package com.lyricflow.app

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper
import com.lyricflow.app.compose.LaunchPrefs
import com.lyricflow.app.compose.LaunchTarget
import com.lyricflow.app.startup.StartupPreloader

class MainApplication : Application(), ReactApplication {

  companion object {
    @Volatile
    var expoLifecycleInitialized: Boolean = false
        private set

    /** Call from MainActivity before React mounts when debug skipped RN at startup. */
  }

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Local Kotlin modules are registered via ExpoModulesPackageList.kt
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    // Debug defers loadReactNative() to ReactActivityDelegate, so SoLoader must
    // be initialized here or expo-dev-launcher's eager feature-flag probe
    // (ReactNativeFeatureFlags.<clinit>) crashes with "SoLoader.init() not yet called".
    SoLoader.init(this, /* native exopackage */ false)
    StartupPreloader.preload(this)
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }

    val launchTarget = LaunchPrefs(this).getLaunchTarget(BuildConfig.COMPOSE_SHELL_DEFAULT_ENABLED)
    val composeFirst = launchTarget == LaunchTarget.COMPOSE_SHELL

    // Expo Dev Launcher must install its React delegate before a debug React
    // context exists. Eager startup here races that delegate and leaves Expo's
    // JS EventEmitter global unavailable. Release keeps the standard eager
    // path; debug lets ReactActivityDelegate create the context after launch.
    //
    // When Compose is the default shell, skip Expo lifecycle in debug so
    // LauncherActivity can mount without libreact_featureflagsjni being loaded.
    // Legacy RN is lazy-initialized from MainActivity.ensureExpoLifecycle().
    if (!BuildConfig.DEBUG) {
      initializeExpoLifecycle()
    } else if (!composeFirst) {
      initializeExpoLifecycle()
    }
  }

  fun initializeExpoLifecycle() {
    if (expoLifecycleInitialized) return
    synchronized(this) {
      if (expoLifecycleInitialized) return
      loadReactNative(this)
      ApplicationLifecycleDispatcher.onApplicationCreate(this)
      expoLifecycleInitialized = true
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
