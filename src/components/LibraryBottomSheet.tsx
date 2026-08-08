import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Modal, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Song } from '../types/song';

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
  onEditLyrics: () => void;
  onDelete: () => void;
  colors: {
    primary: string;
  };
}

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
  onEditLyrics,
  onDelete,
  colors,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{selectedSong?.title}</Text>
          <Text style={styles.subtitle}>{selectedSong?.artist}</Text>

          <Pressable style={styles.option} onPress={onShare}>
            <Ionicons name="share-social-outline" size={24} color={colors.primary} />
            <Text style={styles.optionText}>Share Audio</Text>
          </Pressable>

          <Pressable style={styles.option} onPress={onOpenVersionSearch}>
            <Ionicons name="language-outline" size={24} color={colors.primary} />
            <Text style={styles.optionText}>Change Language / Version</Text>
          </Pressable>

          <Pressable style={styles.option} onPress={onPickImage}>
            <Ionicons name="image-outline" size={24} color={colors.primary} />
            <Text style={styles.optionText}>Choose from Gallery</Text>
          </Pressable>

          <Pressable style={styles.option} onPress={onOpenCoverSearch}>
            <Ionicons name="globe-outline" size={24} color={colors.primary} />
            <Text style={styles.optionText}>Search Web</Text>
          </Pressable>

          {recentArts.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={[styles.subtitle, { textAlign: 'left', marginBottom: 12 }]}>Recent Cover Art</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {recentArts.map((uri, index) => (
                  <Pressable key={index} onPress={() => onSelectRecentArt(uri)} style={{ marginRight: 12 }}>
                    <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 8, backgroundColor: '#333' }} />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <Pressable style={styles.option} onPress={onRemoveCover}>
            <Ionicons name="trash-outline" size={24} color="#FF4444" />
            <Text style={[styles.optionText, { color: '#FF4444' }]}>Remove Cover Art</Text>
          </Pressable>

          <Pressable style={styles.option} onPress={onHideSong}>
            <Ionicons name="eye-off-outline" size={24} color="#FFA500" />
            <Text style={[styles.optionText, { color: '#FFA500' }]}>Hide Song</Text>
          </Pressable>

          <Pressable style={styles.option} onPress={onEditInfo}>
            <Ionicons name="create-outline" size={24} color={colors.primary} />
            <Text style={styles.optionText}>Edit Song Info</Text>
          </Pressable>

          <Pressable style={styles.option} onPress={onEditLyrics}>
            <Ionicons name="musical-notes-outline" size={24} color={colors.primary} />
            <Text style={styles.optionText}>Edit Lyrics</Text>
          </Pressable>

          <Pressable style={[styles.option, styles.cancelOption, { borderBottomWidth: 0, marginTop: 12, backgroundColor: '#2A2A2A' }]} onPress={onDelete}>
            <Ionicons name="trash" size={20} color="#FF4444" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#FF4444', marginLeft: 0 }}>Delete Song</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  handle: { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#aaa', marginBottom: 24, textAlign: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#333' },
  optionText: { fontSize: 16, color: '#fff', marginLeft: 12 },
  cancelOption: { borderBottomWidth: 0, marginTop: 10, justifyContent: 'center', backgroundColor: '#333', borderRadius: 12 },
});

export default React.memo(LibraryBottomSheet);
