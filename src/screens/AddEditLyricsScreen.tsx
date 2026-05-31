/**
 * LyricFlow - Add/Edit Lyrics Screen
 * Form for creating and editing songs
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  // Modal,
} from 'react-native';
// ... imports

import { lyricaService } from '../services/LyricaService';

// ...


import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { GradientPicker, AIGeneratorModal } from '../components';
import { Toast } from '../components/Toast';
import { useThemeColors } from '../contexts/ThemeContext';
import { DEFAULT_GRADIENT_ID } from '../constants/gradients';
import { parseTimestampedLyrics, calculateDuration, lyricsToRawText } from '../utils/timestampParser';
import { generateId } from '../utils/formatters';
import { formatTime } from '../utils/formatters';
import { Song } from '../types/song';
import { LrcSearchModal } from '../components/LrcSearchModal';
import { SearchResult } from '../services/LyricsRepository';
import { GeniusService } from '../services/GeniusService';
import { TransliterationService } from '../services/TransliterationService';

// Helper to parse duration string (mm:ss or seconds)
const parseDurationInput = (input: string): number => {
  const parts = input.trim().split(':');
  if (parts.length === 2) {
    const min = parseInt(parts[0], 10);
    const sec = parseInt(parts[1], 10);
    if (!isNaN(min) && !isNaN(sec)) {
      return min * 60 + sec;
    }
  } else if (parts.length === 1) {
    const val = parseInt(parts[0], 10);
    if (!isNaN(val)) return val;
  }
  return 0;
};

const AddEditLyricsScreen = ({ navigation, route }: any) => {
  const colors = useThemeColors();
  const { songId } = route.params ?? {};
  const isEditing = !!songId;

  const getSong = useSongsStore(state => state.getSong);
  const addSong = useSongsStore(state => state.addSong);
  const updateSong = useSongsStore(state => state.updateSong);
  const setMiniPlayerHiddenSource = usePlayerStore(state => state.setMiniPlayerHiddenSource);

  // Visibility Management: Hide MiniPlayer when Editor is open
  useEffect(() => {
    setMiniPlayerHiddenSource('Editor', true);
    return () => setMiniPlayerHiddenSource('Editor', false);
  }, [setMiniPlayerHiddenSource]);

  // Form state
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [gradientId, setGradientId] = useState(DEFAULT_GRADIENT_ID);
  const [lyricsText, setLyricsText] = useState('');
  const [transliteratedText, setTransliteratedText] = useState('');
  const [isShowingTransliteration, setIsShowingTransliteration] = useState(false);
  
  const [scrollSpeed, setScrollSpeed] = useState(50); // pixels per second
  const [durationText, setDurationText] = useState('');
  const [lyricsAlign, setLyricsAlign] = useState<'left' | 'center' | 'right'>('left');
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  
  // Magic Button State
  const [magicAttempt, setMagicAttempt] = useState<0 | 1 | 2>(0);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicStatus, setMagicStatus] = useState<'idle' | 'green' | 'yellow' | 'blue' | 'red'>('idle');
  
  // Audio URI (kept for legacy compatibility or future local playback, but VAD features removed)
  const [audioUri, setAudioUri] = useState<string | null>(null);

  // Load existing song for editing
  useEffect(() => {
    if (isEditing && songId) {
      const loadSong = async () => {
        const song = await getSong(songId);
        if (song) {
          setTitle(song.title);
          setArtist(song.artist ?? '');
          setAlbum(song.album ?? '');
          // Default to dynamic if it was set, otherwise keep existing
          setGradientId(song.gradientId || (song.coverImageUri ? 'dynamic' : DEFAULT_GRADIENT_ID));
          setLyricsText(lyricsToRawText(song.lyrics));
          setTransliteratedText(song.transliteratedLyrics ? lyricsToRawText(song.transliteratedLyrics) : '');
          setScrollSpeed(song.scrollSpeed ?? 50);
          setDurationText(formatTime(song.duration));
          setLyricsAlign(song.lyricsAlign ?? 'left');
          setAudioUri(song.audioUri ?? null);
        }
      };
      loadSong();
    } else {
        // New Song: Default to Dynamic if we can detect it? 
        // Logic for auto-detecting cover art from audio file would go here if we had it.
        // For now, user sets it manually or it defaults to Aurora.
    }
  }, [songId, isEditing, getSong]);

  const handleCancel = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Main' as never);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        if (isShowingTransliteration) {
            setTransliteratedText((prev) => prev + text);
        } else {
            setLyricsText((prev) => prev + text);
        }
      }
    } catch (error) {
      console.error('Paste failed:', error);
    }
  };

  // Helper to shift all timestamps
  const shiftTimestamps = (offsetSeconds: number) => {
      if (!lyricsText) return;
      
      const lines = lyricsText.split('\n');
      const shiftedLines = lines.map(line => {
          const match = line.match(/^\[(\d+):(\d+(\.\d+)?)\](.*)/);
          if (match) {
              const min = parseInt(match[1], 10);
              const sec = parseFloat(match[2]);
              const content = match[4];
              
              let totalSeconds = min * 60 + sec + offsetSeconds;
              if (totalSeconds < 0) totalSeconds = 0; // Prevent negative time
              
              const newMin = Math.floor(totalSeconds / 60);
              const newSec = (totalSeconds % 60).toFixed(2);
              const newSecFormatted = parseFloat(newSec) < 10 ? `0${newSec}` : newSec;
              
              return `[${newMin}:${newSecFormatted}]${content}`;
          }
          return line;
      });
      
      setLyricsText(shiftedLines.join('\n'));
      
      setToastMessage(`Timestamps Shifted ${offsetSeconds > 0 ? '+' : ''}${offsetSeconds}s`);
      setToastType('success');
      setShowToast(true);
  };

  // ============================================================================
  // SMART SEARCH HANDLER
  // ============================================================================
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleSearch = React.useCallback(async (_query: string) => {
      // Implementation placeholder
  }, []);

  // ============================================================================
  // MAGIC BUTTON LOGIC
  // ============================================================================

  useEffect(() => {
    if (magicStatus !== 'idle' && !magicLoading) {
        const timer = setTimeout(() => {
            setMagicStatus('idle');
        }, 5000); // 5s timeout to reset color
        return () => clearTimeout(timer);
    }
  }, [magicStatus, magicLoading]);

  const handleMagicPress = async () => {
      if (magicLoading) return;
      
      // Validation
      if (!title.trim()) {
        Alert.alert('Missing Title', 'Please enter a song title first.');
        return;
      }

      setMagicLoading(true);

      // determine params
      const searchTitle = title.trim();
      const searchArtist = artist.trim();
      parseDurationInput(durationText); // Validate but not stored if unused elsewhere below
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _searchAlbum = album.trim();

      console.log(`[Magic] Attempt ${magicAttempt}: Searching for "${searchTitle}" by "${searchArtist}"`);

      try {
          // Lyrica Logic: Follows Synced Slow -> Fast -> Plain strategy
          // If we already have plain lyrics (blue), we retry specifically for synced
          const isRetryForSynced = magicStatus === 'blue';
          const durationVal = parseDurationInput(durationText);
          
          const result = await lyricaService.fetchLyrics(
              searchTitle, 
              searchArtist, 
              isRetryForSynced,
              durationVal
          );

          if (result && result.lyrics) {
              const hasSynced = lyricaService.hasTimestamps(result.lyrics);
              const parsed = lyricaService.parseLrc(result.lyrics, result.metadata?.duration || 0);
              
              setLyricsText(lyricsToRawText(parsed));
              if (result.metadata?.duration) setDurationText(formatTime(result.metadata.duration));

              setMagicStatus(hasSynced ? 'green' : 'blue');
              
              const modeText = hasSynced ? 'Synced lyrics applied!' : 'Plain lyrics applied.';
              setToastMessage(`✨ ${modeText} (${result.source})`);
              setToastType('success');
              setShowToast(true);
              setMagicAttempt(0);

          } else {
              setMagicStatus(isRetryForSynced ? 'blue' : 'red'); // Keep blue if we were retrying for synced but failed
              setMagicAttempt(0); 
              setToastMessage(isRetryForSynced ? 'No synced lyrics found to upgrade.' : 'No lyrics found via Lyrica.');
              setToastType(isRetryForSynced ? 'info' : 'error');
              setShowToast(true);
          }

      } catch (error) {
          console.error('[Magic] Error:', error);
          setMagicStatus('red');
          setToastMessage('Network error.');
          setToastType('error');
          setShowToast(true);
      } finally {
          setMagicLoading(false);
      }
  };

  // Removed unused field styles
  const getMagicColor = () => {
      switch (magicStatus) {
          case 'green': return '#4ADE80';
          case 'yellow': return '#FACC15';
          case 'blue': return '#60A5FA';
          case 'red': return '#EF4444';
          case 'idle': 
          default: return 'transparent';
      }
  };// ... (existing code) ...

  const handleSearchResult = async (result: SearchResult) => {
    // ... (existing handleSearchResult logic)
    // We can keep this for the MANUAL search modal interaction
    // ...
    setShowSearchModal(false);
    
    let finalLyrics = result.syncedLyrics || result.plainLyrics;
    
    // If from Genius (or plain LRCLIB), we might want to check the scraper again if empty
    if (result.source === 'Genius' && !finalLyrics && result.url) {
       // ...
       const scraped = await GeniusService.scrapeGeniusLyrics(result.url);
       if (scraped) finalLyrics = scraped;
    }

    if (!finalLyrics) {
      Alert.alert('Error', 'No lyrics text found in this result.');
      return;
    }

    // ...
    let parsedLines = lyricaService.parseLrc(finalLyrics, result.duration);
    const hasSyncedTimestamps = result.syncedLyrics && result.syncedLyrics.includes('[');
    
    if (hasSyncedTimestamps) {
      setLyricsText(lyricsToRawText(parsedLines));
      
      setToastMessage(`✨ Synced Lyrics Auto-Applied from ${result.source}`);
      setToastType('success');
      setShowToast(true);
    } else {
      if (result.source === 'Genius' || result.type === 'plain') {
         if (!finalLyrics.includes('[')) {
            parsedLines = GeniusService.convertToLyricLines(finalLyrics);
         }
      }

      setLyricsText(lyricsToRawText(parsedLines));
      
      setToastMessage(`Lyrics Loaded from ${result.source}`);
      setToastType('success');
      setShowToast(true);
    }

    const duration = result.duration ? result.duration : 0;
    if (duration > 0) {
      setDurationText(formatTime(duration));
    }
  };

  // Placeholder removed as redundant to bottom toolbar or inline button logic

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a song title.');
      return;
    }

    setIsSaving(true);

    try {
      const parsedLyrics = lyricsText.trim() ? parseTimestampedLyrics(lyricsText) : [];
      const manualDuration = parseDurationInput(durationText);
      const calculatedDuration = calculateDuration(parsedLyrics);
      const duration = manualDuration > 0 ? manualDuration : calculatedDuration;
      const now = new Date().toISOString();

      // Fetch original song to preserve fields not edited here (coverArt, etc.)
      const originalSong = isEditing && songId ? await getSong(songId) : null;

      const songData = {
        id: isEditing && songId ? songId : generateId(),
        title: title.trim(),
        artist: artist.trim() || undefined,
        album: album.trim() || undefined,
        gradientId,
        lyrics: parsedLyrics,
        transliteratedLyrics: transliteratedText.trim() ? parseTimestampedLyrics(transliteratedText) : undefined,
        duration,
        dateCreated: originalSong?.dateCreated ?? now,
        dateModified: now,
        playCount: originalSong?.playCount ?? 0,
        lastPlayed: originalSong?.lastPlayed,
        scrollSpeed,
        lyricsAlign,
        audioUri: audioUri ?? undefined,
        // PRESERVE VISUALS & METADATA
        coverImageUri: originalSong?.coverImageUri, 
        lyricSource: originalSong?.lyricSource,
        textCase: originalSong?.textCase,
        isLiked: originalSong?.isLiked
      } as Song;

      if (isEditing) {
        await updateSong(songData);
        // Reload lyrics in player if this song is currently playing
        const { currentSong: playingSong } = usePlayerStore.getState();
        const { updateCurrentSong } = usePlayerStore.getState();
        
        if (playingSong?.id === songData.id) {
           // ✅ Use the new update action
           // Also update transliterated lyrics in player if needed
           updateCurrentSong({ 
              lyrics: songData.lyrics, 
              transliteratedLyrics: songData.transliteratedLyrics, 
              duration: songData.duration,
              gradientId: songData.gradientId,
              coverImageUri: songData.coverImageUri 
           });
        }
        // Update current song in songs store
        const { setCurrentSong } = useSongsStore.getState();
        setCurrentSong(songData);
      } else {
        await addSong(songData);
      }

      setToastMessage('Saved successfully!');
      setToastType('success');
      setShowToast(true);
      setTimeout(() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Main' as never);
        }
      }, 500);
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert(
        'Save Failed', 
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check the console logs and try again.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit lyrics' : 'Add lyrics'}
          </Text>
          <Pressable
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Input Fields */}
          <View style={styles.inputSection}>
            <View>
                {/* Title Input with Magic Button */}
                <View style={{flexDirection: 'row', alignItems: 'flex-end', gap: 10}}>
                   <View style={{flex: 1}}>
                      <FloatingInput
                        label="Song Title"
                        value={title}
                        onChangeText={setTitle}
                      />
                   </View>
                   {/* Sync Button */}
                   <Pressable 
                     style={[styles.magicButtonSmall, { backgroundColor: '#4ADE80' }]} 
                   >
                     <Ionicons name="timer-outline" size={16} color="#000" />
                     <Text style={[styles.magicButtonText, { color: '#000' }]}>Sync</Text>
                   </Pressable>
                   {/* ✨ Magic Search Button */}
                   {/* ✨ Magic Search Button */}
                   <Pressable 
                      style={[
                          styles.magicButtonSmall, 
                          { 
                              backgroundColor: magicStatus === 'idle' ? 'rgba(255,255,255,0.1)' : getMagicColor(),
                              borderColor: magicStatus === 'idle' ? 'rgba(255,255,255,0.2)' : 'transparent',
                              borderWidth: 1,
                              opacity: magicLoading ? 0.7 : 1
                          }
                      ]} 
                      onPress={handleMagicPress}
                      onLongPress={() => setShowSearchModal(true)} // Search Modal on Long Press
                      disabled={magicLoading}
                   >
                     {magicLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                     ) : (
                        <>
                            <Ionicons name="sparkles" size={16} color={magicStatus === 'yellow' || magicStatus === 'green' ? '#000' : '#fff'} />
                            <Text style={[
                                styles.magicButtonText, 
                                (magicStatus === 'yellow' || magicStatus === 'green') && { color: '#000' }
                            ]}>
                                {magicStatus === 'idle' ? 'Magic' : 
                                 magicStatus === 'green' ? 'Synced' :
                                 magicStatus === 'blue' ? 'Plain' :
                                 magicStatus === 'yellow' ? 'Retry' :
                                 'Failed'}
                            </Text>
                        </>
                     )}
                   </Pressable>
                </View>
            </View>

            <FloatingInput
              label="Artist"
              value={artist}
              onChangeText={setArtist}
            />
          </View>

          <View style={styles.inputSection}>
            <FloatingInput
              label="Total Duration (mm:ss)"
              value={durationText}
              onChangeText={setDurationText}
            />
            <Text style={styles.hintText}>Leave empty to auto-calculate from timestamps</Text>
          </View>

          {/* Scroll Speed Slider */}
          <View style={styles.section}>
             <Text style={styles.sectionTitle}>
               Auto-Scroll Speed (Pixels/sec): {scrollSpeed || 50}
             </Text>
             <View style={styles.sliderContainer}>
                <Pressable onPress={() => setScrollSpeed(Math.max(10, scrollSpeed - 5))} style={styles.speedButton}>
                  <Ionicons name="remove" size={24} color={colors.textPrimary} />
                </Pressable>
                <View
                  style={[
                    styles.speedBar,
                    { width: `${((scrollSpeed || 50) / 200) * 100}%` }
                  ]}
                />
                <Pressable onPress={() => setScrollSpeed(Math.min(200, scrollSpeed + 5))} style={styles.speedButton}>
                  <Ionicons name="add" size={24} color={colors.textPrimary} />
                </Pressable>
             </View>
             <Text style={styles.hintText}>Only used if lyrics have no timestamps</Text>
          </View>

          {/* Lyrics Alignment */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Lyrics Alignment</Text>
            <View style={styles.alignmentButtons}>
              <Pressable
                style={[styles.alignButton, lyricsAlign === 'left' && styles.alignButtonActive]}
                onPress={() => setLyricsAlign('left')}
              >
                <Ionicons name="text-outline" size={20} color={lyricsAlign === 'left' ? '#fff' : '#888'} />
                <Text style={[styles.alignButtonText, lyricsAlign === 'left' && styles.alignButtonTextActive]}>Left</Text>
              </Pressable>
              <Pressable
                style={[styles.alignButton, lyricsAlign === 'center' && styles.alignButtonActive]}
                onPress={() => setLyricsAlign('center')}
              >
                <Ionicons name="text" size={20} color={lyricsAlign === 'center' ? '#fff' : '#888'} />
                <Text style={[styles.alignButtonText, lyricsAlign === 'center' && styles.alignButtonTextActive]}>Center</Text>
              </Pressable>
              <Pressable
                style={[styles.alignButton, lyricsAlign === 'right' && styles.alignButtonActive]}
                onPress={() => setLyricsAlign('right')}
              >
                <Ionicons name="text-outline" size={20} color={lyricsAlign === 'right' ? '#fff' : '#888'} style={{ transform: [{ scaleX: -1 }] }} />
                <Text style={[styles.alignButtonText, lyricsAlign === 'right' && styles.alignButtonTextActive]}>Right</Text>
              </Pressable>
            </View>
          </View>



          {/* Global Sync Adjustment */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Global Sync Adjustment (Offset)</Text>
            <Text style={styles.hintText}>Shift all timestamps forward or backward</Text>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.syncScrollContainer}>
                  <Pressable onPress={() => shiftTimestamps(-5)} style={styles.syncBtn}><Text style={styles.syncBtnText}>-5s</Text></Pressable>
                  <Pressable onPress={() => shiftTimestamps(-1)} style={styles.syncBtn}><Text style={styles.syncBtnText}>-1s</Text></Pressable>
                  <Pressable onPress={() => shiftTimestamps(-0.5)} style={styles.syncBtn}><Text style={styles.syncBtnText}>-0.5s</Text></Pressable>
                  <Pressable onPress={() => shiftTimestamps(-0.1)} style={styles.syncBtn}><Text style={styles.syncBtnText}>-0.1s</Text></Pressable>
                  <Pressable onPress={() => shiftTimestamps(0.1)} style={[styles.syncBtn, styles.syncBtnPos]}><Text style={styles.syncBtnText}>+0.1s</Text></Pressable>
                  <Pressable onPress={() => shiftTimestamps(0.5)} style={[styles.syncBtn, styles.syncBtnPos]}><Text style={styles.syncBtnText}>+0.5s</Text></Pressable>
                  <Pressable onPress={() => shiftTimestamps(1)} style={[styles.syncBtn, styles.syncBtnPos]}><Text style={styles.syncBtnText}>+1s</Text></Pressable>
                  <Pressable onPress={() => shiftTimestamps(5)} style={[styles.syncBtn, styles.syncBtnPos]}><Text style={styles.syncBtnText}>+5s</Text></Pressable>
            </ScrollView>
          </View>

          {/* Gradient Picker */}
          <View style={styles.section}>
            <GradientPicker
              selectedId={gradientId}
              onSelect={setGradientId}
            />
          </View>

          
          {/* Lyrics Input */}
          <View style={styles.lyricsSection}>
            <View style={styles.lyricsHeader}>
              <Text style={styles.lyricsLabel}>
                  {isShowingTransliteration ? 'TRANSLITERATION (VIBE MODE)' : 'LYRICS (ORIGINAL)'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                 <Pressable onPress={() => {
                        const nextState = !isShowingTransliteration;
                        setIsShowingTransliteration(nextState);
                        // Auto-generate if switching to view and it's empty
                        if (nextState && !transliteratedText && lyricsText) {
                            console.log('[AddEdit] Auto-generating transliteration...');
                            const parsed = parseTimestampedLyrics(lyricsText);
                            const converted = TransliterationService.transliterate(parsed);
                            const resText = lyricsToRawText(converted);
                            console.log('[AddEdit] Generated text length:', resText.length);
                            setTransliteratedText(resText);
                            setToastMessage('Auto-Transliterated Tanglish vibes');
                            setToastType('success');
                            setShowToast(true);
                        }
                 }}>
                  <Text style={[styles.aiButton, { color: isShowingTransliteration ? '#2F8CFF' : '#7ED957' }]}>
                      {isShowingTransliteration ? 'Show Original' : 'Transliterate'}
                  </Text>
                </Pressable>
                
                { !isShowingTransliteration && (
                    <Pressable onPress={() => setShowSearchModal(true)}>
                      <Text style={styles.aiButton}>FETCH</Text>
                    </Pressable>
                )}
                <Pressable onPress={handlePaste}>
                  <Text style={styles.pasteButton}>Paste</Text>
                </Pressable>
              </View>
            </View>
            <TextInput
              style={[styles.lyricsInput, isShowingTransliteration && { borderColor: '#A78BFA', borderWidth: 1 }]}
              multiline
              placeholder={isShowingTransliteration ? "Transliterated text will appear here..." : "Type or paste lyrics here..."}
              placeholderTextColor={colors.textMuted}
              value={isShowingTransliteration ? transliteratedText : lyricsText}
              onChangeText={isShowingTransliteration ? setTransliteratedText : setLyricsText}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        {/* Processing Overlay (Removed) */}

        <LrcSearchModal
          visible={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSelect={handleSearchResult}
          initialQuery={{
            title: title,
            artist: artist,
            duration: parseDurationInput(durationText)
          }}
          autoPick={true} // Enable Magic Auto-Pick
        />

        <AIGeneratorModal
          visible={showAIModal}
          onClose={() => setShowAIModal(false)}
          onApply={(text) => setLyricsText(text)}
        />

        <Toast
          message={toastMessage}
          type={toastType}
          visible={showToast}
          onDismiss={() => setShowToast(false)}
        />

        {/* Bottom Toolbar */}
        <View style={styles.toolbar}>
          <View style={styles.toolbarLeft}>
            <Pressable style={styles.toolButton}>
              <Ionicons name="text" size={24} color={colors.textSecondary} />
            </Pressable>
            <Pressable style={styles.toolButton}>
              <Ionicons name="create-outline" size={24} color={colors.textSecondary} />
            </Pressable>
            <Pressable style={styles.toolButton}>
              <Ionicons name="reorder-three-outline" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Pressable style={styles.toolButton}>
            <Ionicons name="chevron-down" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

// Floating Label Input Component
interface FloatingInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
}

const FloatingInput: React.FC<FloatingInputProps> = ({ label, value, onChangeText }) => {
  const colors = useThemeColors();
  const [isFocused, setIsFocused] = useState(false);
  const isFloating = isFocused || value.length > 0;

  return (
    <View style={floatingStyles.container}>
      <Text
        style={[
          floatingStyles.label,
          { color: colors.textSecondary },
          isFloating && floatingStyles.labelFloating,
          isFocused && floatingStyles.labelFocused,
        ]}
      >
        {label}
      </Text>
      <TextInput
        style={[floatingStyles.input, { color: colors.textPrimary }, isFocused && floatingStyles.inputFocused]}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    </View>
  );
};

const floatingStyles = StyleSheet.create({
  container: {
    position: 'relative',
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3F3F3F',
  },
  label: {
    position: 'absolute',
    left: 0,
    top: 24,
    fontSize: 16,
  },
  labelFloating: {
    top: 0,
    fontSize: 12,
  },
  labelFocused: {
    color: '#3EA6FF',
  },
  input: {
    fontSize: 16,
    paddingVertical: 8,
  },
  inputFocused: {
    borderBottomColor: '#2F8CFF',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020A16',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  cancelButton: {
    backgroundColor: '#0B1F3A',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  saveButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    gap: 32,
  },
  inputSection: {
    gap: 24,
    paddingTop: 16,
  },
  section: {
    // Empty for now
  },
  lyricsSection: {
    flex: 1,
    gap: 8,
  },
  lyricsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lyricsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 1,
  },
  pasteButton: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2F8CFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7ED957', // Lyric green accent
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lyricsInput: {
    backgroundColor: '#06152B',
    borderRadius: 12,
    padding: 20,
    fontSize: 16,
    color: '#FFFFFF',
    minHeight: 300,
    lineHeight: 24,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#06152B',
    borderTopWidth: 1,
    borderTopColor: '#112A4A',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  toolbarLeft: {
    flexDirection: 'row',
    gap: 32,
  },
  toolButton: {
    padding: 4,
  },
  sectionTitle: {
    color: '#888888',
    marginBottom: 12,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 16,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    height: 48,
    backgroundColor: '#181818',
    borderRadius: 12,
    marginBottom: 8,
  },
  speedButton: {
    padding: 8,
  },
  speedBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#3EA6FF',
    borderRadius: 2,
  },
  hintText: {
    color: '#555555',
    fontSize: 12,
    paddingHorizontal: 16,
  },
  alignmentButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  alignButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#06152B',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  alignButtonActive: {
    backgroundColor: '#0B1F3A',
    borderColor: '#2F8CFF',
  },
  alignButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  alignButtonTextActive: {
    color: '#fff',
  },
  
  // ============================================================================
  // MAGIC TIMESTAMP STYLES
  // ============================================================================
  
  // Magic Button (Small version for header)
  magicButtonCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
  },
  magicButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2F8CFF',
    borderRadius: 8,
  },
  magicButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Audio Picker Styles
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  audioPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#333',
  },
  audioPickerButtonDisabled: {
    opacity: 0.5,
  },
  audioPickerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#888',
  },
  audioPickerTextActive: {
    color: '#fff',
  },
  audioHint: {
    fontSize: 13,
    color: '#2F8CFF',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Sync Styles
  syncScrollContainer: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
    paddingRight: 20, // Padding for last item
  },
  syncBtn: {
    backgroundColor: '#331111', // Darker Red background
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FF4444',
    minWidth: 70,
  },
  syncBtnPos: {
    backgroundColor: '#113311', // Darker Green background
    borderColor: '#44FF44',
  },
  syncBtnText: {
    color: '#FFFFFF', // Explicit White
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default AddEditLyricsScreen;
