import { Platform } from 'react-native';

/**
 * Load an Expo native module safely.
 *
 * Never constructs `new EventEmitter(mod)` — as of Expo SDK 52 the module
 * object is already an EventEmitter (`mod.addListener`). Importing the
 * EventEmitter class itself reads `globalThis.expo.EventEmitter` and throws
 * "Cannot read property 'EventEmitter' of undefined" when the runtime isn't
 * ready or the named module is missing.
 */
export function getNativeModule<T = any>(name: string): T | null {
  if (Platform.OS !== 'android') return null;
  try {
    // requireOptionalNativeModule returns null instead of throwing when missing.
    const { requireOptionalNativeModule } = require('expo-modules-core') as {
      requireOptionalNativeModule: <M>(n: string) => M | null;
    };
    return requireOptionalNativeModule<T>(name);
  } catch {
    return null;
  }
}

/** No-op subscription when a module or listener API is unavailable. */
export const EMPTY_SUB = { remove: () => {} };

/**
 * Subscribe to a native-module event. Prefers the module's own addListener
 * (Expo SDK 52+). Falls back to nothing rather than wrapping EventEmitter.
 */
export function nativeAddListener(
  mod: { addListener?: (event: string, cb: (data: any) => void) => { remove: () => void } } | null,
  eventName: string,
  callback: (data: any) => void,
): { remove: () => void } {
  if (!mod?.addListener) return EMPTY_SUB;
  try {
    return mod.addListener(eventName, callback) ?? EMPTY_SUB;
  } catch {
    return EMPTY_SUB;
  }
}
