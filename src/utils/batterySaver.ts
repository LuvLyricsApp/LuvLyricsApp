/**
 * Whether the phone's Battery Saver is on (Android). Read from the native
 * Startup module, kept fresh by its `onPowerSaveChanged` event and re-read when
 * the app returns to the foreground, and shared by every subscriber so the app
 * holds one listener however many visuals ask.
 */
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { getNativeModule, nativeAddListener } from '../services/nativeModule';

interface StartupPowerModule {
  isPowerSaveMode?: () => boolean;
  addListener?: (event: string, cb: (data: { enabled?: boolean }) => void) => { remove: () => void };
}

const listeners = new Set<() => void>();
let value: boolean | null = null;
let teardown: (() => void) | null = null;

const mod = (): StartupPowerModule | null => getNativeModule<StartupPowerModule>('Startup');

const read = (): boolean => {
  if (Platform.OS !== 'android') return false;
  try {
    return mod()?.isPowerSaveMode?.() === true;
  } catch {
    return false;
  }
};

const set = (next: boolean): void => {
  if (next === value) return;
  value = next;
  listeners.forEach(notify => notify());
};

const attach = (): void => {
  if (teardown) return;
  const app = AppState.addEventListener('change', state => {
    if (state === 'active') set(read());
  });
  const native = nativeAddListener(mod(), 'onPowerSaveChanged', data => set(data?.enabled === true));
  teardown = () => {
    app.remove();
    native.remove();
  };
};

const subscribe = (notify: () => void): (() => void) => {
  listeners.add(notify);
  attach();
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0 && teardown) {
      teardown();
      teardown = null;
    }
  };
};

const snapshot = (): boolean => {
  if (value === null) value = read();
  return value;
};

/** Current Battery Saver state, without subscribing (for non-React callers). */
export const isBatterySaverOn = (): boolean => snapshot();

export const useBatterySaver = (): boolean => useSyncExternalStore(subscribe, snapshot, () => false);
