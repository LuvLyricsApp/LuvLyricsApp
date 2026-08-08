# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ── Added when R8 was switched on for release ────────────────────────────────
# expo-modules-core already ships a consumer rule keeping every
# `expo.modules.kotlin.modules.Module` subclass and its definition(), which
# covers this app's ten native modules (MainPlayer, LuvsPlayer, Palette,
# Search, VoiceInput, Downloader, …). Module names come from the Name("…")
# string inside definition(), not the class name, so obfuscation is safe.
# What follows is for the pieces that are NOT covered by consumer rules.

# JNI entry points — renaming a native method breaks the symbol lookup.
-keepclasseswithmembernames class * {
    native <methods>;
}

# Media3/ExoPlayer backs the Android player; parts are instantiated by name.
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# Sentry needs its stack frames intact to symbolicate.
-keep class io.sentry.** { *; }
-dontwarn io.sentry.**

# Networking used by ytdl / Genius / LAN bridge.
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**

# Kotlin coroutines internals are reflected over.
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }
-dontwarn kotlinx.coroutines.**

# expo-dev-launcher's QR scanner is excluded from release (see app/build.gradle),
# so R8 must not fail the build over the now-absent ML Kit classes. This code
# path is unreachable without the dev menu, which release builds do not have.
-dontwarn com.google.mlkit.**
-dontwarn com.google.android.gms.internal.mlkit_**
-dontwarn com.google.android.gms.vision.**

# Add any project specific keep options here:
