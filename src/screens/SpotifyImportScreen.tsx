/**
 * LyricFlow - Spotify Import
 *
 * BYOK: the user pastes a Client ID from their own Spotify developer app, so no
 * secret ships in the APK and no quota is shared between installs. The only
 * setup step that can go wrong is the Redirect URI, so it is shown here with a
 * copy button rather than buried in documentation.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/colors';
import {
  SpotifyPlaylistSummary,
  completeSpotifyAuth,
  getSpotifyClientId,
  isSpotifyAvailable,
  isSpotifySignedIn,
  listSpotifyPlaylists,
  setSpotifyCredentials,
  spotifyDashboardUrl,
  spotifyDisplayName,
  spotifyLinks,
  spotifyRedirectUri,
  spotifySignIn,
  spotifySignOut,
} from '../services/NativeSpotify';
import {
  SpotifySyncProgress,
  importSpotifyPlaylist,
  subscribeToSpotifySync,
} from '../services/SpotifySyncService';

const SPOTIFY_GREEN = '#1DB954';

export const SpotifyImportScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const available = isSpotifyAvailable();
  const [clientId, setClientId] = useState(() => getSpotifyClientId());
  const [draftClientId, setDraftClientId] = useState('');
  const [signedIn, setSignedIn] = useState(() => isSpotifySignedIn());
  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SpotifySyncProgress | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeToSpotifySync(setProgress), []);

  const refreshPlaylists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlaylists(await listSpotifyPlaylists());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load playlists');
    } finally {
      setLoading(false);
    }
  }, []);

  // The browser redirect lands in the native holder while this screen is away.
  // Re-checking on focus is what turns "came back from Spotify" into a session.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      completeSpotifyAuth()
        .then((completed) => {
          if (cancelled) return;
          const nowSignedIn = isSpotifySignedIn();
          setSignedIn(nowSignedIn);
          if (nowSignedIn && (completed || playlists.length === 0)) refreshPlaylists();
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Sign-in failed');
        });
      return () => { cancelled = true; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshPlaylists]),
  );

  const handleSaveClientId = () => {
    const trimmed = draftClientId.trim();
    if (!trimmed) return;
    setSpotifyCredentials(trimmed);
    setClientId(trimmed);
    setDraftClientId('');
  };

  const handleCopyRedirect = async () => {
    await Clipboard.setStringAsync(spotifyRedirectUri());
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleSignIn = () => {
    try {
      setError(null);
      spotifySignIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open Spotify login');
    }
  };

  const handleSignOut = () => {
    spotifySignOut();
    setSignedIn(false);
    setPlaylists([]);
  };

  if (!available) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header onClose={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Text style={styles.muted}>Spotify import is available on Android only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const busy = progress?.phase === 'fetch' || progress?.phase === 'resolve' || progress?.phase === 'save';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onClose={() => navigation.goBack()} />

      {!clientId ? (
        <View style={styles.body}>
          <Text style={styles.setupTitle}>Connect your Spotify app</Text>
          <Text style={styles.setupBody}>
            Spotify requires each user to use their own app credentials. Create one
            (free, takes a minute), then paste the Client ID here.
          </Text>

          <Pressable style={styles.linkRow} onPress={() => Linking.openURL(spotifyDashboardUrl())}>
            <Ionicons name="open-outline" size={18} color={SPOTIFY_GREEN} />
            <Text style={styles.linkText}>Open Spotify Developer Dashboard</Text>
          </Pressable>

          <Text style={styles.fieldLabel}>ADD THIS REDIRECT URI TO YOUR APP</Text>
          <Pressable style={styles.redirectBox} onPress={handleCopyRedirect}>
            <Text style={styles.redirectText} numberOfLines={1}>{spotifyRedirectUri()}</Text>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={18}
              color={copied ? SPOTIFY_GREEN : Colors.textSecondary}
            />
          </Pressable>

          <Text style={styles.fieldLabel}>CLIENT ID</Text>
          <TextInput
            style={styles.input}
            value={draftClientId}
            onChangeText={setDraftClientId}
            placeholder="Paste your Client ID"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.primaryBtn, !draftClientId.trim() && styles.disabled]}
            onPress={handleSaveClientId}
            disabled={!draftClientId.trim()}
          >
            <Text style={styles.primaryBtnText}>Save</Text>
          </Pressable>
        </View>
      ) : !signedIn ? (
        <View style={styles.body}>
          <Text style={styles.setupTitle}>Sign in to Spotify</Text>
          <Text style={styles.setupBody}>
            Opens Spotify in your browser. Read-only — LuvLyrics never modifies
            anything in your Spotify account.
          </Text>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.primaryBtn} onPress={handleSignIn}>
            <Text style={styles.primaryBtnText}>Sign in with Spotify</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => { setSpotifyCredentials(''); setClientId(''); }}
          >
            <Text style={styles.secondaryBtnText}>Change Client ID</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.accountRow}>
            <Text style={styles.accountName} numberOfLines={1}>
              {spotifyDisplayName() ?? 'Signed in'}
            </Text>
            <Pressable onPress={handleSignOut} hitSlop={10}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          </View>

          {busy && !!progress && (
            <View style={styles.progressBox}>
              <Text style={styles.progressTitle} numberOfLines={1}>
                {progress.playlistName}
              </Text>
              <Text style={styles.progressMsg} numberOfLines={1}>
                {progress.total > 0
                  ? `${progress.current}/${progress.total} · ${progress.message}`
                  : progress.message}
              </Text>
            </View>
          )}
          {progress?.phase === 'done' && (
            <View style={styles.progressBox}>
              <Text style={styles.progressMsg}>{progress.message}</Text>
            </View>
          )}
          {progress?.phase === 'error' && !!progress.error && (
            <View style={styles.progressBox}>
              <Text style={styles.error}>{progress.error}</Text>
            </View>
          )}

          {loading ? (
            <View style={styles.centered}><ActivityIndicator color={SPOTIFY_GREEN} /></View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.error}>{error}</Text>
              <Pressable style={styles.secondaryBtn} onPress={refreshPlaylists}>
                <Text style={styles.secondaryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              onRefresh={refreshPlaylists}
              refreshing={loading}
              renderItem={({ item }) => {
                const linked = !!spotifyLinks.getLocalPlaylistId(item.id);
                return (
                  <View style={styles.row}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.cover} />
                    ) : (
                      <View style={[styles.cover, styles.coverFallback]}>
                        <Ionicons name="heart" size={22} color={SPOTIFY_GREEN} />
                      </View>
                    )}
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {item.trackCount} tracks{item.ownerName ? ` · ${item.ownerName}` : ''}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.importBtn, busy && styles.disabled]}
                      disabled={busy}
                      onPress={() => importSpotifyPlaylist(item)}
                    >
                      <Text style={styles.importBtnText}>{linked ? 'Sync' : 'Import'}</Text>
                    </Pressable>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.muted, styles.list]}>No playlists found.</Text>
              }
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
};

const Header: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <View style={styles.header}>
    <Text style={styles.headerTitle}>Spotify</Text>
    <Pressable onPress={onClose} hitSlop={12}>
      <Ionicons name="close" size={26} color={Colors.textPrimary} />
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },
  body: { paddingHorizontal: 20, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  muted: { color: Colors.textMuted, fontSize: 14, textAlign: 'center' },
  setupTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  setupBody: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  linkText: { color: SPOTIFY_GREEN, fontSize: 14, fontWeight: '600' },
  fieldLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 8,
  },
  redirectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  redirectText: { color: Colors.textPrimary, fontSize: 13, flex: 1 },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: SPOTIFY_GREEN,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  error: { color: '#FF6B6B', fontSize: 13, lineHeight: 18 },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  accountName: { color: Colors.textSecondary, fontSize: 14, flex: 1 },
  signOut: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  progressBox: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.card,
    gap: 4,
  },
  progressTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  progressMsg: { color: Colors.textSecondary, fontSize: 13 },
  list: { paddingHorizontal: 20, paddingBottom: 140 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  cover: { width: 52, height: 52, borderRadius: 6, backgroundColor: Colors.cardHover },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  rowSub: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  importBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: SPOTIFY_GREEN,
  },
  importBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
});

export default SpotifyImportScreen;
