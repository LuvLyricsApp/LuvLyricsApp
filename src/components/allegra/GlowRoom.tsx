/**
 * The "Glow" app background: the mini player's animated glow, poured across
 * the top of the screen and melting into plain black.
 *
 *   top ~35%  — Echo's drifting glow (player/GlowBackground) in the playing
 *               cover's colours; it keeps moving, slowly, while music plays
 *   below     — pure black, reached through a long fade so there is no edge
 *
 * Content sits on true black, which is the calmest thing for text and the
 * lightest thing for the battery: only the small top region is ever drawn
 * moving. With no song playing it is black with a faint neutral glow.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlowBackground from '../player/GlowBackground';
import { useGlowColors } from '../player/useGlowColors';

/** How much of the screen the glow owns before it has faded to black. */
export const GLOW_ROOM_REACH = 0.35;

interface GlowRoomProps {
  /** The playing cover, for the glow's colours. */
  coverUri?: string | null;
  /** Screen not visible: the glow stops moving. */
  active?: boolean;
  /** Extra darkening under dense content (0 = none). */
  dim?: number;
}

/** Fades to solid black through the second half of the glow's reach. */
export const GLOW_FADE_LOCATIONS = [0, 0.45, 0.78, 1] as const;

const GlowRoom: React.FC<GlowRoomProps> = ({ coverUri, active = true, dim = 0 }) => {
  const colors = useGlowColors(coverUri);
  return (
    <View style={[StyleSheet.absoluteFill, styles.base]} pointerEvents="none">
      <View style={[styles.top, { height: `${GLOW_ROOM_REACH * 100}%` }]}>
        <GlowBackground colors={colors} variant="mini" active={active} />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.62)', '#000000']}
          locations={[...GLOW_FADE_LOCATIONS]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${Math.min(0.6, dim * 0.4)})` }]} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  base: { backgroundColor: '#000000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
});

export default React.memo(GlowRoom);
