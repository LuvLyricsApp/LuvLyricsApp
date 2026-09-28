/**
 * Listen Together state (Echo's ListenTogetherClient flows, as one store).
 * The client writes it; the player menu, the room sheet and the join-request
 * card read it. Persisted: the name, the session (for reconnecting after the
 * app restarts) and Echo's Listen together settings — auto-approve, blocked
 * people, host volume sync, smart resync and the server.
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
  /** A room code from an invite link, waiting to be joined. */
  inviteCode: string | null;
  /** Waiting for the host to let us in. */
  pendingJoinCode: string | null;
  /** One-line news for a toast ("Room ABC123 created", "Maya joined"). */
  notice: { id: number; text: string } | null;
  rttMs: number | null;

  // persisted
  username: string;
  autoApprove: boolean;
  session: StoredSession | null;
  /** Names whose join requests and suggestions are turned away (Echo's blocked users). */
  blocked: string[];
  /** Guests take the host's volume; the host sends theirs (Echo: on). */
  syncHostVolume: boolean;
  /** A guest asks for a fresh sync a second after reconnecting (Echo: on). */
  smartResync: boolean;
  /** A chosen server; empty = the one Echo publishes (server.json). */
  serverUrl: string;

  setUsername: (name: string) => void;
  setAutoApprove: (on: boolean) => void;
  block: (name: string) => void;
  unblock: (name: string) => void;
  setSyncHostVolume: (on: boolean) => void;
  setSmartResync: (on: boolean) => void;
  setServerUrl: (url: string) => void;
  announce: (text: string) => void;
}

/** A usable room server address: ws:// or wss://, nothing else. */
export const isServerUrl = (url: string): boolean => /^wss?:\/\/[^\s/]+/i.test(url.trim());

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
      inviteCode: null,
      notice: null,
      rttMs: null,

      username: '',
      autoApprove: false,
      session: null,
      blocked: [],
      syncHostVolume: true,
      smartResync: true,
      serverUrl: '',

      setUsername: name => set({ username: name.trim().slice(0, 32) }),
      setAutoApprove: on => set({ autoApprove: on }),
      block: name => set(s => ({
        blocked: s.blocked.includes(name) ? s.blocked : [...s.blocked, name],
        joinRequests: s.joinRequests.filter(r => r.username !== name),
        suggestions: s.suggestions.filter(x => x.from_username !== name),
      })),
      unblock: name => set(s => ({ blocked: s.blocked.filter(n => n !== name) })),
      setSyncHostVolume: on => set({ syncHostVolume: on }),
      setSmartResync: on => set({ smartResync: on }),
      setServerUrl: url => set({ serverUrl: isServerUrl(url) ? url.trim() : '' }),
      announce: text => set({ notice: { id: ++noticeId, text } }),
    }),
    {
      name: 'luvlyrics-listen-together',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({
        username: s.username,
        autoApprove: s.autoApprove,
        session: s.session,
        blocked: s.blocked,
        syncHostVolume: s.syncHostVolume,
        smartResync: s.smartResync,
        serverUrl: s.serverUrl,
      }),
    },
  ),
);

