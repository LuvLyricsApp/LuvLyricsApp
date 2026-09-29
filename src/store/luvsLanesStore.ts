/**
 * The Luvs taste map: lanes side by side, each remembering how deep you went.
 * "For you" mirrors the Luvs engine's feed (luvsFeedStore); the other lanes
 * load on demand (services/luvsLanes). Nothing here is persisted.
 */
import { create } from 'zustand';
import type { UnifiedSong } from '../types/song';
import type { LaneSpec } from '../services/luvsLanes';

export type LaneStatus = 'idle' | 'loading' | 'ready' | 'empty';

export interface Lane extends LaneSpec {
  songs: UnifiedSong[];
  status: LaneStatus;
  /** A deepen request is in flight. */
  growing: boolean;
}

interface LuvsLanesState {
  lanes: Lane[];
  laneIndex: number;
  /** Depth per lane, by lane position. */
  depths: number[];
  setSpecs: (specs: LaneSpec[]) => void;
  setLaneSongs: (id: string, songs: UnifiedSong[], status?: LaneStatus) => void;
  appendLaneSongs: (id: string, songs: UnifiedSong[]) => void;
  setLaneStatus: (id: string, status: LaneStatus) => void;
  setGrowing: (id: string, growing: boolean) => void;
  moveTo: (laneIndex: number, depth: number) => void;
}

export const useLuvsLanesStore = create<LuvsLanesState>(set => ({
  lanes: [],
  laneIndex: 0,
  depths: [],

  // New specs keep the songs and depth of lanes that are still there.
  setSpecs: specs => set(s => {
    const lanes = specs.map<Lane>(spec => {
      const old = s.lanes.find(l => l.id === spec.id);
      return old ? { ...old, ...spec } : { ...spec, songs: [], status: 'idle', growing: false };
    });
    const depths = lanes.map(l => {
      const at = s.lanes.findIndex(o => o.id === l.id);
      return at >= 0 ? s.depths[at] ?? 0 : 0;
    });
    const current = s.lanes[s.laneIndex]?.id;
    const laneIndex = Math.max(0, lanes.findIndex(l => l.id === current));
    return { lanes, depths, laneIndex };
  }),

  setLaneSongs: (id, songs, status) => set(s => ({
    lanes: s.lanes.map(l => (l.id === id ? { ...l, songs, status: status ?? (songs.length > 0 ? 'ready' : 'empty') } : l)),
  })),

  appendLaneSongs: (id, songs) => set(s => ({
    lanes: s.lanes.map(l => (l.id === id ? { ...l, songs: [...l.songs, ...songs], growing: false } : l)),
  })),

  setLaneStatus: (id, status) => set(s => ({ lanes: s.lanes.map(l => (l.id === id ? { ...l, status } : l)) })),

  setGrowing: (id, growing) => set(s => ({ lanes: s.lanes.map(l => (l.id === id ? { ...l, growing } : l)) })),

  moveTo: (laneIndex, depth) => set(s => {
    const depths = [...s.depths];
    depths[laneIndex] = depth;
    return { laneIndex, depths };
  }),
}));
