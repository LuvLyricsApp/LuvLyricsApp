/**
 * Headless handler for both home-screen widgets: renders them from the saved
 * snapshot and answers their buttons.
 *
 * Transport buttons act on the player when the app's JS runtime is alive
 * (music playing in the background keeps it alive). Song rows, "play
 * playlist" and share are deep links instead, so they work from a cold start.
 */
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { NowPlayingWidget, PlaylistWidget } from './SongWidget';
import { readSnapshot, writeSnapshot, WidgetSnapshot } from './widgetData';

export const WIDGET_NOW_PLAYING = 'NowPlaying';
export const WIDGET_PLAYLIST = 'Playlist';

const render = (props: WidgetTaskHandlerProps, snapshot: WidgetSnapshot) => {
  const { widgetInfo } = props;
  if (widgetInfo.widgetName === WIDGET_PLAYLIST) {
    props.renderWidget(<PlaylistWidget snapshot={snapshot} width={widgetInfo.width} />);
  } else {
    props.renderWidget(<NowPlayingWidget snapshot={snapshot} width={widgetInfo.width} height={widgetInfo.height} />);
  }
};

/** Runs a transport action if the player is loaded in this JS runtime. */
const act = async (action: string, snapshot: WidgetSnapshot): Promise<WidgetSnapshot> => {
  const { usePlayerStore } = await import('../store/playerStore');
  const player = usePlayerStore.getState();
  if (!player.currentSong) return snapshot; // cold start: nothing loaded to control
  switch (action) {
    case 'TOGGLE_PLAY': {
      const next = !player.isPlaying;
      player.requestPlayback(next);
      return { ...snapshot, isPlaying: next };
    }
    case 'NEXT':
      await player.nextInPlaylist();
      return snapshot;
    case 'PREVIOUS':
      await player.previousInPlaylist();
      return snapshot;
    case 'TOGGLE_LIKE': {
      const { useSongsStore } = await import('../store/songsStore');
      await useSongsStore.getState().toggleLike(player.currentSong.id);
      return { ...snapshot, liked: !snapshot.liked };
    }
    default:
      return snapshot;
  }
};

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  let snapshot = await readSnapshot();
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      render(props, snapshot);
      break;
    case 'WIDGET_CLICK': {
      const action = props.clickAction ?? '';
      if (action === 'NEXT_PLAYLIST') {
        snapshot = { ...snapshot, playlistIndex: snapshot.playlistIndex + 1 };
        await writeSnapshot(snapshot);
      } else {
        // Optimistic frame first, so the button answers at once.
        snapshot = await act(action, snapshot).catch(() => snapshot);
      }
      render(props, snapshot);
      break;
    }
    default:
      break;
  }
}
