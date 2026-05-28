import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DesktopBridgeSettings {
  desktopConnectEnabled: boolean;
  allowDesktopDownloads: boolean;
  setDesktopConnectEnabled: (v: boolean) => Promise<void>;
  setAllowDesktopDownloads: (v: boolean) => Promise<void>;
  load: () => Promise<void>;
}

const KEYS = {
  desktopConnectEnabled: '@desktop_bridge_enabled',
  allowDesktopDownloads: '@desktop_bridge_allow_downloads',
};

export const useDesktopBridgeSettingsStore = create<DesktopBridgeSettings>((set) => ({
  desktopConnectEnabled: true,
  allowDesktopDownloads: true,

  setDesktopConnectEnabled: async (v) => {
    set({ desktopConnectEnabled: v });
    await AsyncStorage.setItem(KEYS.desktopConnectEnabled, JSON.stringify(v));

    const { desktopBridgeService } = await import('../services/DesktopBridgeService');
    if (v) {
      await desktopBridgeService.start();
      if (__DEV__) console.log('[DesktopBridgeSettings] Desktop bridge started from settings toggle');
    } else {
      desktopBridgeService.stop();
      if (__DEV__) console.log('[DesktopBridgeSettings] Desktop bridge stopped from settings toggle');
    }
  },

  setAllowDesktopDownloads: async (v) => {
    set({ allowDesktopDownloads: v });
    await AsyncStorage.setItem(KEYS.allowDesktopDownloads, JSON.stringify(v));
  },

  load: async () => {
    try {
      const [enabled, downloads] = await AsyncStorage.multiGet([
        KEYS.desktopConnectEnabled,
        KEYS.allowDesktopDownloads,
      ]);
      const desktopConnectEnabled = enabled[1] !== null ? JSON.parse(enabled[1]) : true;
      const allowDesktopDownloads = downloads[1] !== null ? JSON.parse(downloads[1]) : true;
      set({ desktopConnectEnabled, allowDesktopDownloads });

      if (desktopConnectEnabled) {
        if (__DEV__) console.log('[DesktopBridgeSettings] desktopBridgeSettingsStore.load() starting desktop bridge');
        const { desktopBridgeService } = await import('../services/DesktopBridgeService');
        await desktopBridgeService.start();
        if (__DEV__) console.log('[DesktopBridgeSettings] Desktop bridge started from desktopBridgeSettingsStore.load()');
      }
    } catch (e) {
      if (__DEV__) console.warn('[DesktopBridgeSettings] Failed to load:', e);
    }
  },
}));
