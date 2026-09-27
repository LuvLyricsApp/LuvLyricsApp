/**
 * Listen Together state (Echo's ListenTogetherClient flows, as one store).
 * The client writes it; the player menu, the room sheet and the join-request
 * card read it. Only the name, auto-approve and the session (for reconnecting
 * after the app restarts) are persisted.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  JoinRequestPayload,
  RoomState,
  SuggestionReceivedPayload,
} from '../services/listenTogether/protocol';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type RoomRole = 'none' | 'host' | 'guest';

export interface StoredSession {
  token: string;
  roomCode: string;
  wasHost: boolean;
  /** Last time the server answered (joined, reconnected or a ping). */
  startedAt: number;
}

interface ListenTogetherState {
  connection: ConnectionState;
  role: RoomRole;
  userId: string | null;
  room: RoomState | null;
  joinRequests: JoinRequestPayload[];
  suggestions: SuggestionReceivedPayload[];
  bufferingUsers: string[];
  /** Waiting for the host to let us in. */
  pendingJoinCode: string | null;
  /** One-line news for a toast ("Room ABC123 created", "Maya joined"). */
  notice: { id: number; text: string } | null;
  rttMs: number | null;

  // persisted
  username: string;
  autoApprove: boolean;
  session: StoredSession | null;

  setUsername: (name: string) => void;
  setAutoApprove: (on: boolean) => void;
  announce: (text: string) => void;
}

let noticeId = 0;

export const useListenTogetherStore = create<ListenTogetherState>()(
  persist(
    set => ({
      connection: 'disconnected',
      role: 'none',
      userId: null,
      room: null,
      joinRequests: [],
      suggestions: [],
      bufferingUsers: [],
      pendingJoinCode: null,
      notice: null,
      rttMs: null,

      username: '',
      autoApprove: false,
      session: null,

      setUsername: name => set({ username: name.trim().slice(0, 32) }),
      setAutoApprove: on => set({ autoApprove: on }),
      announce: text => set({ notice: { id: ++noticeId, text } }),
    }),
    {
      name: 'luvlyrics-listen-together',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({ username: s.username, autoApprove: s.autoApprove, session: s.session }),
    },
  ),
);

export const isInRoom = (): boolean => useListenTogetherStore.getState().room !== null;
