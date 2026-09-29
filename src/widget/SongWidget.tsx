/**
 * Home-screen widgets (Android, react-native-android-widget).
 *
 * NowPlayingWidget — the reference card: a soft frame around the cover
 * full-bleed, a frosted pill up top with the song, share + like circles,
 * then elapsed / remaining time, a progress hairline and round transport
 * buttons over a dark fade at the foot.
 *
 * PlaylistWidget — one of your playlists as a scrollable list; tap a song to
 * play it from there, the round button plays the whole playlist, › cycles to
 * the next playlist.
 *
 * RemoteViews can't blur, so "frosted" is a dark translucent fill over the
 * cover, and every glyph is an inline SVG (icons.ts).
 */
import React from 'react';
import { FlexWidget, ImageWidget, ListWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';
import { Icon } from './icons';
import { formatClock, widgetLink, WidgetPlaylist, WidgetSnapshot } from './widgetData';

const INK = '#F4F1EA';
const INK_MUTED = '#A9ADB2';
const WAVE = '#D9E66A';
const CORAL = '#EE6B5F';
const FRAME = '#1B1C20';
const GLASS: ColorProp = 'rgba(38, 39, 44, 0.78)';
const GLASS_LIGHT: ColorProp = 'rgba(24, 25, 30, 0.55)';

type ImageSource = React.ComponentProps<typeof ImageWidget>['image'];
const asImage = (uri: string) => uri as ImageSource;

// ─── Small parts ────────────────────────────────────────────────────────────

const RoundButton: React.FC<{
  size: number;
  icon: string;
  iconSize: number;
  action: string;
  data?: Record<string, unknown>;
  fill?: ColorProp;
  label: string;
}> = ({ size, icon, iconSize, action, data, fill = GLASS, label }) => (
  <FlexWidget
    clickAction={action}
    clickActionData={data}
    accessibilityLabel={label}
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: fill,
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <SvgWidget svg={icon} style={{ width: iconSize, height: iconSize }} />
  </FlexWidget>
);

const Cover: React.FC<{ uri?: string; size: number; radius: number }> = ({ uri, size, radius }) =>
  uri ? (
    <ImageWidget image={asImage(uri)} imageWidth={size} imageHeight={size} radius={radius} />
  ) : (
    <FlexWidget
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundGradient: { from: '#3A2F4A', to: '#16181D', orientation: 'TL_BR' },
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <SvgWidget svg={Icon.note(INK_MUTED)} style={{ width: size * 0.4, height: size * 0.4 }} />
    </FlexWidget>
  );

// ─── Now playing ────────────────────────────────────────────────────────────

export const NowPlayingWidget: React.FC<{ snapshot: WidgetSnapshot; width: number; height: number }> = ({
  snapshot,
  width,
  height,
}) => {
  const { song, isPlaying, liked, position, duration } = snapshot;
  const pad = 8;
  const inner = Math.max(120, Math.min(width, height) - pad * 2);
  const compact = inner < 190;
  const btn = compact ? 34 : 44;
  const playBtn = compact ? 40 : 52;
  const barWidth = inner - 32;
  const progress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const filled = Math.max(4, Math.round(barWidth * progress));

  if (!song) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          width: 'match_parent',
          height: 'match_parent',
          borderRadius: 28,
          backgroundGradient: { from: '#24202C', to: '#101114', orientation: 'TL_BR' },
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <SvgWidget svg={Icon.note(WAVE)} style={{ width: 30, height: 30 }} />
        <TextWidget text="Nothing playing" style={{ fontSize: 16, fontWeight: '600', color: INK, marginTop: 10 }} />
        <TextWidget text="Tap to open LuvLyrics" style={{ fontSize: 12, color: INK_MUTED, marginTop: 2 }} />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        borderRadius: 32,
        backgroundColor: FRAME,
        justifyContent: 'center',
        alignItems: 'center',
        padding: pad,
      }}
    >
      <OverlapWidget style={{ width: inner, height: inner, borderRadius: 26 }}>
        {/* Cover, full-bleed */}
        {song.cover ? (
          <ImageWidget image={asImage(song.cover)} imageWidth={inner} imageHeight={inner} radius={26} clickAction="OPEN_URI" clickActionData={{ uri: widgetLink.nowPlaying() }} />
        ) : (
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: widgetLink.nowPlaying() }}
            style={{ width: inner, height: inner, borderRadius: 26, backgroundGradient: { from: '#4A3558', to: '#15161B', orientation: 'TL_BR' } }}
          />
        )}

        {/* Legibility: light at the top, deep at the foot */}
        <FlexWidget style={{ width: inner, height: inner, flexDirection: 'column' }}>
          <FlexWidget style={{ width: inner, height: inner * 0.3, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundGradient: { from: 'rgba(8, 9, 12, 0.45)', to: 'rgba(8, 9, 12, 0)', orientation: 'TOP_BOTTOM' } }} />
          <FlexWidget style={{ width: inner, height: inner * 0.25 }} />
          <FlexWidget style={{ width: inner, height: inner * 0.45, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, backgroundGradient: { from: 'rgba(8, 9, 12, 0)', to: 'rgba(8, 9, 12, 0.88)', orientation: 'TOP_BOTTOM' } }} />
        </FlexWidget>

        {/* Controls */}
        <FlexWidget style={{ width: inner, height: inner, flexDirection: 'column', padding: compact ? 10 : 14 }}>
          {/* Top: song pill + share + like */}
          <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
            <FlexWidget
              clickAction="OPEN_URI"
              clickActionData={{ uri: widgetLink.nowPlaying() }}
              style={{
                flex: 1,
                height: btn,
                borderRadius: btn / 2,
                backgroundColor: GLASS,
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 4,
                paddingRight: 12,
              }}
            >
              <Cover uri={song.cover} size={btn - 8} radius={(btn - 8) / 2} />
              {compact ? null : (
                <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 8 }}>
                  <TextWidget text={song.title} maxLines={1} truncate="END" style={{ fontSize: 13, fontWeight: '700', color: INK }} />
                  <TextWidget text={song.artist || 'Unknown artist'} maxLines={1} truncate="END" style={{ fontSize: 11, color: INK_MUTED }} />
                </FlexWidget>
              )}
            </FlexWidget>
            <FlexWidget style={{ width: 8, height: 1 }} />
            <RoundButton size={btn} iconSize={compact ? 16 : 20} icon={Icon.share(INK)} action="OPEN_URI" data={{ uri: widgetLink.share() }} label="Share" />
            <FlexWidget style={{ width: 8, height: 1 }} />
            <RoundButton size={btn} iconSize={compact ? 16 : 20} icon={liked ? Icon.heart(CORAL) : Icon.heartOutline(INK)} action="TOGGLE_LIKE" label={liked ? 'Unlike' : 'Like'} />
          </FlexWidget>

          <FlexWidget style={{ flex: 1, width: 'match_parent' }} />

          {/* Time + progress */}
          {compact ? null : (
            <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 6 }}>
              <TextWidget text={formatClock(position)} style={{ fontSize: 12, fontWeight: '600', color: INK }} />
              <TextWidget text={`-${formatClock(duration - position)}`} style={{ fontSize: 12, fontWeight: '600', color: INK }} />
            </FlexWidget>
          )}
          <FlexWidget style={{ width: barWidth, height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.26)', flexDirection: 'row' }}>
            <FlexWidget style={{ width: filled, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' }} />
          </FlexWidget>

          {/* Transport */}
          <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: compact ? 8 : 12 }}>
            <RoundButton size={btn} iconSize={compact ? 16 : 20} icon={Icon.previous(INK)} action="PREVIOUS" label="Previous" fill={GLASS_LIGHT} />
            <FlexWidget style={{ width: compact ? 10 : 18, height: 1 }} />
            <RoundButton size={playBtn} iconSize={compact ? 20 : 24} icon={isPlaying ? Icon.pause(INK) : Icon.play(INK)} action="TOGGLE_PLAY" label={isPlaying ? 'Pause' : 'Play'} fill={GLASS_LIGHT} />
            <FlexWidget style={{ width: compact ? 10 : 18, height: 1 }} />
            <RoundButton size={btn} iconSize={compact ? 16 : 20} icon={Icon.next(INK)} action="NEXT" label="Next" fill={GLASS_LIGHT} />
          </FlexWidget>
        </FlexWidget>
      </OverlapWidget>
    </FlexWidget>
  );
};

// ─── Playlist ───────────────────────────────────────────────────────────────

export const PlaylistWidget: React.FC<{ snapshot: WidgetSnapshot; width: number }> = ({ snapshot, width }) => {
  const playlists = snapshot.playlists;
  const playlist: WidgetPlaylist | undefined = playlists.length
    ? playlists[((snapshot.playlistIndex % playlists.length) + playlists.length) % playlists.length]
    : undefined;
  const playingId = snapshot.song?.id;

  const shell = {
    width: 'match_parent' as const,
    height: 'match_parent' as const,
    borderRadius: 28,
    backgroundGradient: { from: 'rgba(30, 28, 36, 0.97)' as ColorProp, to: 'rgba(12, 13, 16, 0.97)' as ColorProp, orientation: 'TOP_BOTTOM' as const },
    padding: 14,
    flexDirection: 'column' as const,
  };

  if (!playlist) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ ...shell, justifyContent: 'center', alignItems: 'center' }}>
        <SvgWidget svg={Icon.note(WAVE)} style={{ width: 28, height: 28 }} />
        <TextWidget text="No playlists yet" style={{ fontSize: 15, fontWeight: '600', color: INK, marginTop: 8 }} />
        <TextWidget text="Make one in LuvLyrics" style={{ fontSize: 12, color: INK_MUTED, marginTop: 2 }} />
      </FlexWidget>
    );
  }

  const rowWidth = Math.max(160, width - 28);

  return (
    <FlexWidget style={shell}>
      {/* Header */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Cover uri={playlist.cover} size={44} radius={12} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 10 }}>
          <TextWidget text={playlist.name} maxLines={1} truncate="END" style={{ fontSize: 16, fontWeight: '700', color: INK }} />
          <TextWidget text={`${playlist.songCount} ${playlist.songCount === 1 ? 'song' : 'songs'}`} style={{ fontSize: 12, color: INK_MUTED }} />
        </FlexWidget>
        <RoundButton size={40} iconSize={20} icon={Icon.play('#17180D')} action="OPEN_URI" data={{ uri: widgetLink.playPlaylist(playlist.id) }} fill={WAVE} label={`Play ${playlist.name}`} />
        {playlists.length > 1 ? (
          <>
            <FlexWidget style={{ width: 6, height: 1 }} />
            <RoundButton size={34} iconSize={16} icon={Icon.chevronRight(INK)} action="NEXT_PLAYLIST" label="Next playlist" fill={GLASS_LIGHT} />
          </>
        ) : null}
      </FlexWidget>

      {/* Songs */}
      <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
        {playlist.songs.map(s => {
          const on = s.id === playingId;
          return (
            <FlexWidget
              key={s.id}
              clickAction="OPEN_URI"
              clickActionData={{ uri: widgetLink.playSong(playlist.id, s.id) }}
              style={{
                width: rowWidth,
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 6,
                paddingHorizontal: 6,
                borderRadius: 14,
                backgroundColor: on ? 'rgba(217, 230, 106, 0.12)' : 'rgba(0, 0, 0, 0)',
              }}
            >
              <Cover uri={s.cover} size={40} radius={9} />
              <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 10 }}>
                <TextWidget text={s.title} maxLines={1} truncate="END" style={{ fontSize: 14, fontWeight: '600', color: on ? WAVE : INK }} />
                <TextWidget text={s.artist || 'Unknown artist'} maxLines={1} truncate="END" style={{ fontSize: 12, color: INK_MUTED }} />
              </FlexWidget>
              {on ? <SvgWidget svg={(snapshot.isPlaying ? Icon.pause : Icon.play)(WAVE)} style={{ width: 16, height: 16 }} /> : null}
            </FlexWidget>
          );
        })}
      </ListWidget>
    </FlexWidget>
  );
};
