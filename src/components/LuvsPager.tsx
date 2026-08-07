/**
 * JS binding for the native Kotlin reels pager (LuvsPagerView / ViewPager2).
 *
 * Android only. `isNativePagerAvailable` is false everywhere else, and callers are
 * expected to fall back to a paging FlatList — see LuvsScreen.
 */

import React from 'react';
import { Platform, StyleSheet, ViewProps } from 'react-native';

export type LuvsPagerScrollState = 'idle' | 'dragging' | 'settling';

export interface LuvsPagerProps extends ViewProps {
  /** Fires the moment ViewPager2 commits to a target page — before it finishes settling. */
  onPageSelected?: (event: { nativeEvent: { position: number } }) => void;
  onPageScrollStateChanged?: (event: { nativeEvent: { state: LuvsPagerScrollState } }) => void;
  scrollEnabled?: boolean;
  hapticsOnSettle?: boolean;
  depthEffect?: boolean;
  offscreenPages?: number;
  children?: React.ReactNode;
}

export interface LuvsPagerHandle {
  setPage: (index: number, animated: boolean) => void;
}

let NativeLuvsPager: React.ComponentType<any> | null = null;

if (Platform.OS === 'android') {
  try {
    const { requireNativeView, requireOptionalNativeModule } = require('expo');
    // requireNativeView only warns when the manager is missing, so it would hand back
    // a component that fails at render time. Probe for the module itself first —
    // that returns null on a build that predates LuvsPagerModule.
    if (requireOptionalNativeModule('LuvsPager')) {
      NativeLuvsPager = requireNativeView('LuvsPager');
    }
  } catch {
    // Native view missing (Expo Go, or a build predating the module) — caller falls back.
  }
}

export const isNativePagerAvailable = NativeLuvsPager != null;

export const LuvsPager = React.forwardRef<LuvsPagerHandle, LuvsPagerProps>(
  ({ children, style, ...props }, ref) => {
    const nativeRef = React.useRef<any>(null);

    React.useImperativeHandle(ref, () => ({
      setPage: (index: number, animated: boolean) => {
        nativeRef.current?.setPage(index, animated);
      },
    }), []);

    if (!NativeLuvsPager) return null;

    return (
      <NativeLuvsPager ref={nativeRef} style={[styles.pager, style]} {...props}>
        {children}
      </NativeLuvsPager>
    );
  }
);

LuvsPager.displayName = 'LuvsPager';

/**
 * Every page has to resolve to the same Yoga frame (0, 0, W, H). The pages are
 * reparented into RecyclerView holders on the native side, so a stacked flex layout
 * would have Yoga positioning page N at y = N * height while the holder draws it at
 * y = 0 — the two disagree and pages render off-screen.
 */
export const luvsPageStyle = StyleSheet.absoluteFillObject;

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
});

export default LuvsPager;
