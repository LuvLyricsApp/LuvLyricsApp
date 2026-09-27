/**
 * The one artwork component. Every cover in the app goes through here so that:
 *
 *   - real covers fade in over a designed placeholder instead of popping,
 *   - a broken or missing cover never shows a grey box with a note icon —
 *     it shows GeneratedArtwork: an editorial duotone cover built from the
 *     song's own title, deterministic so a song always gets the same one.
 */
import React, { useMemo, useState } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Fonts } from '../../constants/fonts';
import { Motion } from '../../constants/allegraTheme';
import { duotoneFor, hashString, monogramOf } from './artworkSeed';

export { duotoneFor, hashString, monogramOf };

interface GeneratedArtworkProps {
  title: string;
  artist?: string;
  size: number;
}

export const GeneratedArtwork: React.FC<GeneratedArtworkProps> = React.memo(({ title, artist, size }) => {
  const seed = `${title}|${artist ?? ''}`;
  const [base, mid, spark] = useMemo(() => duotoneFor(seed), [seed]);
  const variant = hashString(seed + '#v') % 3;
  const glyph = monogramOf(title);
  const showLabel = size >= 120;
  const id = `g${hashString(seed).toString(36)}`;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]}>
      <LinearGradient
        colors={[base, mid]}
        start={variant === 1 ? { x: 1, y: 0 } : { x: 0, y: 0 }}
        end={variant === 1 ? { x: 0, y: 1 } : { x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`${id}l`} cx={variant === 2 ? '22%' : '78%'} cy="22%" r="62%">
            <Stop offset="0" stopColor={spark} stopOpacity={0.55} />
            <Stop offset="1" stopColor={spark} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}d`} cx="30%" cy="100%" r="70%">
            <Stop offset="0" stopColor={base} stopOpacity={0.7} />
            <Stop offset="1" stopColor={base} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#${id}l)`} />
        <Rect width="100" height="100" fill={`url(#${id}d)`} />
        {/* Concentric grooves — a quiet vinyl reference, cropped off the edge. */}
        {[34, 46, 58].map((r, i) => (
          <Circle
            key={r}
            cx={variant === 2 ? 86 : 14}
            cy={86}
            r={r}
            stroke={spark}
            strokeOpacity={0.14 - i * 0.03}
            strokeWidth={0.8}
            fill="none"
          />
        ))}
      </Svg>

      {/* Oversized monogram bleeding off the corner — the cover's typography. */}
      <Text
        allowFontScaling={false}
        style={[
          styles.monogram,
          {
            fontSize: size * 0.9,
            lineHeight: size * 0.96,
            color: spark,
            right: -size * 0.08,
            bottom: -size * 0.2,
          },
        ]}
      >
        {glyph}
      </Text>

      {showLabel ? (
        <View style={[styles.label, { padding: size * 0.075 }]}>
          <Text style={[styles.labelTitle, { fontSize: Math.max(13, size * 0.085) }]} numberOfLines={2}>{title}</Text>
          {artist ? <Text style={[styles.labelArtist, { fontSize: Math.max(10, size * 0.058) }]} numberOfLines={1}>{artist}</Text> : null}
        </View>
      ) : null}
    </View>
  );
});

interface ArtworkProps {
  uri?: string | null;
  title: string;
  artist?: string;
  /** Rendered edge length — drives placeholder typography. Defaults to 160. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Hint for the image cache; the on-screen hero wants 'high'. */
  priority?: 'low' | 'normal' | 'high';
  /** Fade duration for the real cover over the placeholder. */
  transition?: number;
}

export const Artwork: React.FC<ArtworkProps> = ({ uri, title, artist, size = 160, style, priority = 'normal', transition = Motion.duration.base }) => {
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;
  return (
    <View style={[styles.frame, style]}>
      <GeneratedArtwork title={title || 'Untitled'} artist={artist} size={size} />
      {showImage ? (
        <Image
          source={{ uri }}
          recyclingKey={uri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={{ duration: transition, effect: 'cross-dissolve' }}
          priority={priority}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  monogram: {
    position: 'absolute',
    fontFamily: Fonts.interBlack,
    letterSpacing: -4,
    opacity: 0.28,
  },
  label: {
    position: 'absolute',
    left: 0,
    right: '28%',
    top: 0,
  },
  labelTitle: {
    fontFamily: Fonts.interBold,
    color: '#f4f1ea',
    letterSpacing: -0.4,
  },
  labelArtist: {
    fontFamily: Fonts.interMedium,
    color: 'rgba(244, 241, 234, 0.72)',
    marginTop: 3,
  },
});

export default Artwork;
