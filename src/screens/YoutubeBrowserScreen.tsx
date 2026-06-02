/**
 * YoutubeBrowserScreen.tsx
 * 
 * In-App YouTube Browser using Invidious + on-device audio extraction.
 * 
 * Architecture:
 * 1. User browses Invidious (YouTube frontend) in a WebView — no blocking
 * 2. When on a video page, injected JS calls the Invidious API via same-origin XHR
 *    to get direct googlevideo.com CDN audio URLs
 * 3. FAB appears when audio URL is found
 * 4. Tapping FAB hands off to AudioDownloader with the direct audio URL
 * 
 * This is 100% on-device — the key trick is same-origin XHR bypasses
 * the "api: false" restriction that blocks external API calls.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { usePlayerStore } from '../store/playerStore';
import { YoutubeBrowserStrings } from '../constants/uiStrings';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// ─── Official YouTube Mobile Site Interceptor ───────────────────────
// Uses m.youtube.com + ytInitialPlayerResponse interception (Snaptube style)
const YOUTUBE_URL = 'https://m.youtube.com';

const INJECTION_SCRIPT = `
(function() {
  var lastVideoId = '';
  
  function getVideoIdFromUrl() {
    // m.youtube.com format: /watch?v=...
    var match = location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  function extractFromPlayerResponse() {
    try {
      var videoId = getVideoIdFromUrl();
      if (!videoId || videoId === lastVideoId) return;

      // 1. Check for ytInitialPlayerResponse (global variable on mobile web)
      var playerResponse = window.ytInitialPlayerResponse;
      
      // 2. Fallback: Check ytcfg object if response is missing
      if (!playerResponse && window.ytcfg && window.ytcfg.data_ && window.ytcfg.data_.PLAYER_VARS) {
         var playerVars = window.ytcfg.data_.PLAYER_VARS;
         if (playerVars.embedded_player_response) {
            playerResponse = JSON.parse(playerVars.embedded_player_response);
         }
      }

      if (!playerResponse || !playerResponse.streamingData) return;

      var streamingData = playerResponse.streamingData;
      var formats = (streamingData.adaptiveFormats || []).concat(streamingData.formats || []);
      
      // Filter for unencrypted URLs (no signatureCipher)
      var validFormats = formats.filter(function(f) {
        return f.url && f.url.indexOf('googlevideo.com') !== -1;
      });

      if (validFormats.length > 0) {
        // Sort by audio quality
        var audioFormats = validFormats.filter(function(f) {
           return (f.mimeType || '').indexOf('audio') !== -1;
        });
        
        if (audioFormats.length > 0) {
            audioFormats.sort(function(a, b) {
                // Prefer m4a over webm
                var aIsMp4 = (a.mimeType || '').indexOf('mp4') !== -1 ? 1 : 0;
                var bIsMp4 = (b.mimeType || '').indexOf('mp4') !== -1 ? 1 : 0;
                if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4;
                return (b.bitrate || 0) - (a.bitrate || 0);
            });
            var bestAudio = audioFormats[0];
            
            lastVideoId = videoId;
            var videoDetails = playerResponse.videoDetails || {};
            
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'AUDIO_EXTRACTED',
                videoId: videoId,
                title: videoDetails.title || document.title,
                author: videoDetails.author || 'Unknown',
                audioUrl: bestAudio.url,
                audioBitrate: bestAudio.bitrate || 128000,
                audioMimeType: bestAudio.mimeType || 'audio/mp4', // approximate
                lengthSeconds: parseInt(videoDetails.lengthSeconds || '0'),
                thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg'
            }));
            return;
        }
        
        // Fallback to video stream if no pure audio found (mp4 video often bas mixed audio)
        var bestVideo = validFormats[0];
        lastVideoId = videoId;
        var videoDetails = playerResponse.videoDetails || {};

        window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'AUDIO_EXTRACTED',
            videoId: videoId,
            title: videoDetails.title || document.title,
            author: videoDetails.author || 'Unknown',
            audioUrl: bestVideo.url,
            audioBitrate: 64000, // assume lower qual
            audioMimeType: 'video/mp4',
            lengthSeconds: parseInt(videoDetails.lengthSeconds || '0'),
            thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg'
        }));
      }

    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ 
        type: 'EXTRACTION_ERROR', error: e.message 
      }));
    }
  }

  // Poll for player response change
  setInterval(function() {
    if (location.href.indexOf('watch?v=') !== -1) {
       extractFromPlayerResponse();
    }
  }, 1000);
})();
true;
`;

// ─── Types ──────────────────────────────────────────────────────────
interface VideoInfo {
  title: string;
  author: string;
  videoId: string;
  audioUrl: string;
  audioBitrate: number;
  audioFormat: string;
  thumbnail: string;
  lengthSeconds: number;
}

// ─── Component ──────────────────────────────────────────────────────
export const YoutubeBrowserScreen = ({ navigation }: any) => {
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  
  // Visibility Management: Hide MiniPlayer when Youtube Browser is open
  useEffect(() => {
    setMiniPlayerHidden(true);
    return () => setMiniPlayerHidden(false);
  }, [setMiniPlayerHidden]);

  const webViewRef = useRef<WebView>(null);
  const [isVideoPage, setIsVideoPage] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // FAB animation
  const fabScale = useSharedValue(0);
  const fabTranslateY = useSharedValue(100);

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: fabScale.value as number },
      { translateY: fabTranslateY.value as number },
    ] as const,
    opacity: fabScale.value,
  }));

  const showFab = useCallback(() => {
    fabScale.value = withSpring(1, { damping: 12, stiffness: 120 });
    fabTranslateY.value = withSpring(0, { damping: 14, stiffness: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hideFab = useCallback(() => {
    fabScale.value = withTiming(0, { duration: 200 });
    fabTranslateY.value = withTiming(100, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Navigation State Handler ──────────────────────────────
  const handleNavigationChange = useCallback((navState: WebViewNavigation) => {
    const isVideo = navState.url.includes('watch?v=');
    
    if (isVideo && !isVideoPage) {
      setIsExtracting(true);
    }
    setIsVideoPage(isVideo);

    if (!isVideo) {
      setVideoInfo(null);
      setIsExtracting(false);
      hideFab();
    }
  }, [isVideoPage, hideFab]);

  // ─── Message Handler ───────────────────────────────────────
  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'AUDIO_EXTRACTED') {
        const bitrateKbps = Math.round((data.audioBitrate || 128000) / 1000);
        const ext = data.audioMimeType?.includes('audio/mp4') ? 'm4a' : 'webm';
        
        if (__DEV__) {
          console.log(`[YTBrowser] ✓ Audio extracted: ${data.title}`);
          console.log(`[YTBrowser] URL: ${data.audioUrl.substring(0, 100)}...`);
          console.log(`[YTBrowser] Bitrate: ${bitrateKbps}kbps, Format: ${ext}, Duration: ${data.lengthSeconds}s`);
        }
        
        setVideoInfo({
          title: data.title,
          author: data.author,
          videoId: data.videoId,
          audioUrl: data.audioUrl,
          audioBitrate: bitrateKbps,
          audioFormat: ext,
          thumbnail: data.thumbnail,
          lengthSeconds: data.lengthSeconds || 0,
        });

        setIsExtracting(false);
        showFab();
      } else if (data.type === 'EXTRACTION_ERROR') {
         // Silent warning
         if (__DEV__) console.log(`[YTBrowser] Extraction err: ${data.error}`);
      }
    } catch {
      // Ignore non-JSON messages
    }
  }, [showFab]);

  // ─── FAB Press ─────────────────────────────────────────────
  const handleDownloadPress = useCallback(() => {
    if (!videoInfo) return;

    if (__DEV__) console.log(`[YTBrowser] Handing off: ${videoInfo.title}`);

    navigation.replace('AudioDownloader', {
      fromBrowser: true,
      videoTitle: videoInfo.title,
      videoAuthor: videoInfo.author,
      videoId: videoInfo.videoId,
      audioUrl: videoInfo.audioUrl,
      audioBitrate: videoInfo.audioBitrate,
      audioFormat: videoInfo.audioFormat,
      thumbnail: videoInfo.thumbnail,
      lengthSeconds: videoInfo.lengthSeconds,
    });
  }, [videoInfo, navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <View style={styles.urlBar}>
            <Ionicons name="logo-youtube" size={14} color="#FF0000" />
            <Text style={styles.urlText} numberOfLines={1}>
              YouTube
            </Text>
          </View>
          <Pressable 
            onPress={() => {
              setLoadError(null);
              webViewRef.current?.reload();
            }} 
            style={styles.headerBtn}
          >
            <Ionicons name="refresh" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Error State */}
        {loadError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline-outline" size={48} color="#666" />
            <Text style={styles.errorTitle}>{YoutubeBrowserStrings.connectionFailed}</Text>
            <Text style={styles.errorMessage}>{loadError}</Text>
            <Pressable style={styles.retryButton} onPress={() => {
              setLoadError(null);
              webViewRef.current?.reload();
            }}>
              <Text style={styles.retryButtonText}>{YoutubeBrowserStrings.retry}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* WebView */}
        <WebView
          ref={webViewRef}
          source={{ uri: YOUTUBE_URL }}
          style={[styles.webview, loadError ? { height: 0 } : {}]}
          injectedJavaScript={INJECTION_SCRIPT}
          onNavigationStateChange={handleNavigationChange}
          onMessage={handleMessage}
          onLoadStart={() => { setIsLoading(true); setLoadError(null); }}
          onLoadEnd={() => setIsLoading(false)}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn(`[YTBrowser] WebView error: ${nativeEvent.description}`);
            if (nativeEvent.description !== 'net::ERR_CACHE_MISS') {
               setLoadError(nativeEvent.description || 'Failed to load');
            }
            setIsLoading(false);
          }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          thirdPartyCookiesEnabled={true}
          originWhitelist={['https://*', 'http://*']}
          setSupportMultipleWindows={false}
          startInLoadingState={true}
          cacheEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
        />

        {/* Loading indicator */}
        {isLoading && !loadError && (
          <View style={styles.loadingBar}>
            <ActivityIndicator size="small" color="#FF0000" />
          </View>
        )}

        {/* Extracting audio badge */}
        {isExtracting && (
          <View style={styles.detectingBadge}>
            <ActivityIndicator size="small" color="#FFD700" />
            <Text style={styles.detectingText}>{YoutubeBrowserStrings.analyzingStream}</Text>
          </View>
        )}

        {/* Floating Action Button */}
        <Animated.View style={[styles.fabContainer, fabAnimatedStyle]}>
          <Pressable onPress={handleDownloadPress}>
            <LinearGradient
              colors={['#FF0000', '#CC0000']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fab}
            >
              <Ionicons name="download-outline" size={22} color="#fff" />
              <View style={styles.fabTextContainer}>
                <Text style={styles.fabTitle}>{YoutubeBrowserStrings.downloadThisSong}</Text>
                {videoInfo && (
                  <Text style={styles.fabSubtitle} numberOfLines={1}>
                    {videoInfo.title.substring(0, 35)} • {videoInfo.audioBitrate}kbps
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 8,
    backgroundColor: '#1a1a1a', gap: 8,
  },
  headerBtn: { padding: 8 },
  urlBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#333', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  urlText: { color: '#ccc', fontSize: 14, fontWeight: '600', flex: 1 },
  webview: { flex: 1 },
  loadingBar: {
    position: 'absolute', top: 100, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  detectingBadge: {
    position: 'absolute', top: 100, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  detectingText: { color: '#FFD700', fontSize: 13, fontWeight: '600' },
  fabContainer: {
    position: 'absolute', bottom: 30, left: 16, right: 16, zIndex: 10,
  },
  fab: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderRadius: 28, gap: 12,
    shadowColor: '#8E2DE2', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  fabTextContainer: { flex: 1 },
  fabTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  fabSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  errorContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, gap: 12,
  },
  errorTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 8 },
  errorMessage: { color: '#888', fontSize: 13, textAlign: 'center' },
  errorInstance: { color: '#555', fontSize: 11, marginTop: 4 },
  errorButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  retryButton: {
    backgroundColor: '#8E2DE2', paddingHorizontal: 24,
    paddingVertical: 12, borderRadius: 20,
  },
  switchButton: {
    backgroundColor: '#333', paddingHorizontal: 24,
    paddingVertical: 12, borderRadius: 20,
  },
  retryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

export default YoutubeBrowserScreen;
