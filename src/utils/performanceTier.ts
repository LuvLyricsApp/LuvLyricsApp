/**
 * How much motion the phone can carry. Old and budget Android phones get the
 * light path: the shader renders fewer pixels at 30fps and rests while music
 * is paused, glass skips the live blur, and entrances fade instead of rise.
 * Everything still animates; it just costs less.
 */
import { Platform } from 'react-native';
import { getNativeModule } from '../services/nativeModule';

export type PerformanceTier = 'low' | 'normal';

interface DeviceProfile {
  totalMemMb: number;
  lowRam: boolean;
  cores: number;
  apiLevel: number;
}

/** Pure rule, exported for tests. */
export const tierFor = (p: DeviceProfile): PerformanceTier =>
  p.lowRam || p.totalMemMb < 3500 || p.cores <= 4 || p.apiLevel < 29 ? 'low' : 'normal';

let cached: PerformanceTier | null = null;

export const performanceTier = (): PerformanceTier => {
  if (cached) return cached;
  cached = 'normal';
  if (Platform.OS === 'android') {
    try {
      const profile = getNativeModule<{ deviceProfile?: () => DeviceProfile }>('Startup')?.deviceProfile?.();
      if (profile) cached = tierFor(profile);
      else if (Number(Platform.Version) < 29) cached = 'low';
    } catch {
      // Unknown device: keep the normal path.
    }
  }
  return cached;
};

export const isLowEndDevice = (): boolean => performanceTier() === 'low';
