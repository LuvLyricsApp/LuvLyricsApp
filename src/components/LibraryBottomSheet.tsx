import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Modal, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Song } from '../types/song';
import { Frosted } from './allegra/Frosted';
import { Glass, Signal } from '../constants/allegraTheme';

interface LibraryBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  selectedSong: Song | null;
  onShare: () => void;
  onOpenVersionSearch: () => void;
  onPickImage: () => void;
  onOpenCoverSearch: () => void;
  recentArts: string[];
  onSelectRecentArt: (uri: string) => void;
  onRemoveCover: () => void;
  onHideSong: () => void;
  onEditInfo: () => void;
  onDelete: () => void;
  colors: {
    primary: string;
  };
}

type Tone = 'normal' | 'warn' | 'danger';

const Row: React.FC<{ icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; tone?: Tone; tint: string }> = ({ icon, label, onPress, tone = 'normal', tint }) => (
  <Pressable style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={onPress}>
    <View style={[styles.optionIcon, tone === 'danger' && styles.optionIconDanger]}>
      <Ionicons name={icon} size={19} color={tone === 'danger' ? Signal.accent : tone === 'warn' ? Signal.accentBright : tint} />
    </View>
    <Text style={[styles.optionText, tone === 'danger' && { color: Signal.accent }]}>{label}</Text>
  </Pressable>
);

const LibraryBottomSheet: React.FC<LibraryBottomSheetProps> = ({
  visible,
  onClose,
  selectedSong,
  onShare,
  onOpenVersionSearch,
  onPickImage,
  onOpenCoverSearch,
  recentArts,
  onSelectRecentArt,
  onRemoveCover,
  onHideSong,
  onEditInfo,
  onDelete,
  colors,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <Frosted radius={28} intensity={60} tint={0.55} />
          <View style={styles.handle} />
          <Text style={styles.title} numberOfLines={1}>{selectedSong?.title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{selectedSong?.artist}</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            <Row icon="share-social-outline" label="Share the audio" onPress={onShare} tint={colors.primary} />
            <Row icon="language-outline" label="Another language or version" onPress={onOpenVersionSearch} tint={colors.primary} />
            <Row icon="image-outline" label="Cover from your photos" onPress={onPickImage} tint={colors.primary} />
            <Row icon="globe-outline" label="Find a cover online" onPress={onOpenCoverSearch} tint={colors.primary} />

            {recentArts.length > 0 && (
              <View style={styles.recent}>
                <Text style={styles.recentTitle}>Recent covers</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {recentArts.map((uri, index) => (
                    <Pressable key={index} onPress={() => onSelectRecentArt(uri)} style={styles.recentItem}>
                      <Image source={{ uri }} style={styles.recentImage} />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <Row icon="create-outline" label="Edit title and artist" onPress={onEditInfo} tint={colors.primary} />
            <Row icon="eye-off-outline" label="Hide this song" onPress={onHideSong} tone="warn" tint={colors.primary} />
            <Row icon="close-circle-outline" label="Remove the cover" onPress={onRemoveCover} tone="warn" tint={colors.primary} />

            <Pressable style={({ pressed }) => [styles.delete, pressed && styles.optionPressed]} onPress={onDelete}>
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles.deleteText}>Delete song</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Glass.scrim, justifyContent: 'flex-end' },
  container: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34, maxHeight: '86%' },
  handle: { width: 36, height: 5, backgroundColor: 'rgba(244,241,234,0.28)', borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 19, fontWeight: '700', color: Signal.ink, marginBottom: 2, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Signal.inkMuted, marginBottom: 18, textAlign: 'center' },
  scroll: { flexGrow: 0 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6, borderRadius: 14 },
  optionPressed: { backgroundColor: Glass.fillPressed },
  optionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.fillLight },
  optionIconDanger: { backgroundColor: 'rgba(238, 107, 95, 0.14)' },
  optionText: { fontSize: 16, color: Signal.ink, marginLeft: 14, fontWeight: '500' },
  recent: { marginVertical: 10 },
  recentTitle: { fontSize: 13, color: Signal.inkMuted, marginBottom: 10, marginLeft: 6 },
  recentItem: { marginRight: 10 },
  recentImage: { width: 72, height: 72, borderRadius: 12, backgroundColor: Glass.fillLight },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 14, borderRadius: 999, backgroundColor: Signal.accent },
  deleteText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

export default React.memo(LibraryBottomSheet);
