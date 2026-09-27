package expo.modules

import expo.modules.core.interfaces.Package
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.ModulesProvider

/**
 * Override of the Expo autolinking-generated ExpoModulesPackageList.
 * Includes all auto-linked expo npm modules + local app modules.
 *
 * If a build error reports a duplicate class, ensure app/build.gradle
 * removes the generated/expo source set in afterEvaluate (see that file).
 */
class ExpoModulesPackageList : ModulesProvider {

    companion object {
        @JvmStatic
        fun getPackageList(): List<Package> = listOf(
            expo.modules.adapters.react.ReactAdapterPackage(),
            expo.modules.constants.ConstantsPackage(),
            expo.modules.core.BasePackage(),
            expo.modules.devlauncher.DevLauncherPackage(),
            expo.modules.devmenu.DevMenuPackage(),
            expo.modules.filesystem.legacy.FileSystemPackage(),
            expo.modules.imageloader.ImageLoaderPackage(),
            expo.modules.keepawake.KeepAwakePackage(),
            expo.modules.kotlin.edgeToEdge.EdgeToEdgePackage(),
            expo.modules.systemui.SystemUIPackage(),
            io.sentry.react.expo.SentryExpoPackage(),
        )
    }

    // expo-video's VideoModule is marked @UnstableReactNativeAPI; referencing
    // it needs an explicit opt-in (Expo's generated list does the same).
    @OptIn(com.facebook.react.common.annotations.UnstableReactNativeAPI::class)
    override fun getModulesList(): List<Class<out Module>> = listOf(
        // Auto-linked expo modules
        expo.modules.fetch.ExpoFetchModule::class.java,
        expo.modules.asset.AssetModule::class.java,
        expo.modules.audio.AudioModule::class.java,
        expo.modules.blur.BlurModule::class.java,
        expo.modules.clipboard.ClipboardModule::class.java,
        expo.modules.constants.ConstantsModule::class.java,
        expo.modules.devmenu.modules.DevMenuModule::class.java,
        expo.modules.documentpicker.DocumentPickerModule::class.java,
        expo.modules.filesystem.FileSystemModule::class.java,
        expo.modules.filesystem.legacy.FileSystemLegacyModule::class.java,
        expo.modules.font.FontLoaderModule::class.java,
        expo.modules.font.FontUtilsModule::class.java,
        expo.modules.haptics.HapticsModule::class.java,
        expo.modules.image.ExpoImageModule::class.java,
        expo.modules.imagepicker.ImagePickerModule::class.java,
        expo.modules.keepawake.KeepAwakeModule::class.java,
        expo.modules.lineargradient.LinearGradientModule::class.java,
        expo.modules.medialibrary.MediaLibraryModule::class.java,
        expo.modules.medialibrary.next.MediaLibraryNextModule::class.java,
        expo.modules.sharing.SharingModule::class.java,
        expo.modules.sqlite.SQLiteModule::class.java,
        expo.modules.systemui.SystemUIModule::class.java,
        expo.modules.video.VideoModule::class.java,

        // Local app modules
        com.lyricflow.app.modules.StartupModule::class.java,
        com.lyricflow.app.modules.MainPlayerModule::class.java,
        com.lyricflow.app.modules.LuvsPlayerModule::class.java,
        com.lyricflow.app.modules.LuvsPagerModule::class.java,
        com.lyricflow.app.modules.LuvsEngineModule::class.java,
        com.lyricflow.app.modules.DownloaderModule::class.java,
        com.lyricflow.app.modules.SearchModule::class.java,
        com.lyricflow.app.modules.PaletteModule::class.java,
        com.lyricflow.app.modules.VoiceInputModule::class.java,
    )
}
