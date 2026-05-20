import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DesktopBridgeSettings {
  desktopConnectEnabled: boolean;
  allowDesktopDownloads: boolean;
  controlPort: number;
  setDesktopConnectEnabled: (v: boolean) => Promise<void>;
  setAllowDesktopDownloads: (v: boolean) => Promise<void>;
  setControlPort: (v: number) => Promise<void>;
  load: () => Promise<void>;
}

const KEYS = {
  desktopConnectEnabled: '@desktop_bridge_enabled',
  allowDesktopDownloads: '@desktop_bridge_allow_downloads',
  controlPort: '@desktop_bridge_control_port',
};

export const useDesktopBridgeSettingsStore = create<DesktopBridgeSettings>((set) => ({
  desktopConnectEnabled: true,
  allowDesktopDownloads: true,
  controlPort: 8765,

  setDesktopConnectEnabled: async (v) => {
    set({ desktopConnectEnabled: v });
    await AsyncStorage.setItem(KEYS.desktopConnectEnabled, JSON.stringify(v));

    const { desktopBridgeService } = await import('../services/DesktopBridgeService');
    if (v) {
      await desktopBridgeService.start();
      console.log('[DesktopBridgeSettings] Desktop bridge started from settings toggle');
    } else {
      desktopBridgeService.stop();
      console.log('[DesktopBridgeSettings] Desktop bridge stopped from settings toggle');
    }
  },

  setAllowDesktopDownloads: async (v) => {
    set({ allowDesktopDownloads: v });
    await AsyncStorage.setItem(KEYS.allowDesktopDownloads, JSON.stringify(v));
  },

  setControlPort: async (v) => {
    const normalized = Math.max(1024, Math.min(65535, Math.floor(v)));
    set({ controlPort: normalized });
    await AsyncStorage.setItem(KEYS.controlPort, JSON.stringify(normalized));
    const { desktopBridgeService } = await import('../services/DesktopBridgeService');
    await desktopBridgeService.updateControlPort(normalized);
  },

  load: async () => {
    try {
      const [enabled, downloads, controlPortEntry] = await AsyncStorage.multiGet([
        KEYS.desktopConnectEnabled,
        KEYS.allowDesktopDownloads,
        KEYS.controlPort,
      ]);
      const desktopConnectEnabled = enabled[1] !== null ? JSON.parse(enabled[1]) : true;
      const allowDesktopDownloads = downloads[1] !== null ? JSON.parse(downloads[1]) : true;
      const controlPortRaw = controlPortEntry?.[1];
      const controlPort = controlPortRaw !== null && controlPortRaw !== undefined ? JSON.parse(controlPortRaw) : 8765;
      set({ desktopConnectEnabled, allowDesktopDownloads, controlPort });

      if (desktopConnectEnabled) {
        console.log('[DesktopBridgeSettings] desktopBridgeSettingsStore.load() starting desktop bridge');
        const { desktopBridgeService } = await import('../services/DesktopBridgeService');
        await desktopBridgeService.updateControlPort(controlPort);
        await desktopBridgeService.start();
        console.log('[DesktopBridgeSettings] Desktop bridge started from desktopBridgeSettingsStore.load()');
      }
    } catch (e) {
      console.warn('[DesktopBridgeSettings] Failed to load:', e);
    }
  },
}));
