import React, { memo } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { UnifiedSong } from '../types/song';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';

const CARD_MARGIN = 8;

interface DownloadGridCardProps {
  song: UnifiedSong;
  isSelected: boolean;
  isPlayingPreview: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onPlayPress: () => void;
  onArtistPress: () => void;
  selectionMode?: boolean;
}

export const DownloadGridCard = memo(({
  song, isSelected, isPlayingPreview,
  onPress, onLongPress, onPlayPress, onArtistPress, selectionMode
}: DownloadGridCardProps) => {
  const colors = useThemeColors();

  return (
    <Pressable
      style={[styles.container, isSelected && { borderColor: colors.primary, backgroundColor: '#2A2A2A' }]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.coverContainer}>
        <Image source={{ uri: song.highResArt }} style={styles.coverImage} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.4)']} style={styles.gradientOverlay} />
        <Pressable style={styles.playButtonOverlay} onPress={(e) => { e.stopPropagation(); onPlayPress(); }}>
          <View style={styles.glassButton}>
            <Ionicons name={isPlayingPreview ? 'pause' : 'play'} size={24} color="#fff" style={{ marginLeft: isPlayingPreview ? 0 : 2 }} />
          </View>
        </Pressable>
        {(isSelected || selectionMode) && (
          <View style={[styles.checkmarkBadge, !isSelected && styles.emptyBadge]}>
            <Ionicons
              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={isSelected ? colors.primary : 'rgba(255,255,255,0.5)'}
            />
          </View>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
        <Pressable onPress={(e) => { e.stopPropagation(); onArtistPress(); }}>
          <Text style={[styles.artist, { color: colors.primary }]} numberOfLines={1}>
            {song.artist}{' '}
            {song.isAuthentic && <Ionicons name="checkmark-circle" size={12} color={colors.primary} />}
            {' '}
            <Ionicons name="arrow-forward-circle-outline" size={12} color={colors.primary} />
          </Text>
        </Pressable>
        <View style={styles.metaRow}>
          {!!song.duration && (
            <Text style={styles.metaText}>
              {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}
            </Text>
          )}
          <View style={[styles.providerBadge, {
            backgroundColor:
              song.source === 'Saavn' ? '#2ecc71' :
              song.source === 'Gaana' ? '#e74c3c' :
              song.source === 'Wynk' ? '#e74c3c' :
              song.source === 'NetEase' ? '#e60026' : '#f39c12'
          }]}>
            <Text style={styles.providerText}>{song.source}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1, margin: CARD_MARGIN, backgroundColor: '#1A1A1A', borderRadius: 12,
    overflow: 'hidden', height: 220, borderWidth: 2, borderColor: 'transparent', elevation: 4,
  },
  coverContainer: { height: '70%', width: '100%', position: 'relative' },
  coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  gradientOverlay: { ...StyleSheet.absoluteFillObject },
  playButtonOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  glassButton: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  checkmarkBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#fff', borderRadius: 12 },
  emptyBadge: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  infoContainer: { height: '30%', padding: 8, justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  artist: { fontSize: 12, fontWeight: '600' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { color: '#888', fontSize: 11 },
  providerBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  providerText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
