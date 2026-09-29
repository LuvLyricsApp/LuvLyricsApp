import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal, TextInput } from 'react-native';
import { Frosted } from './allegra/Frosted';
import { Glass, Signal } from '../constants/allegraTheme';

interface LibraryEditModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  onTitleChange: (text: string) => void;
  artist: string;
  onArtistChange: (text: string) => void;
  onSave: () => void;
  primaryColor: string;
}

const LibraryEditModal: React.FC<LibraryEditModalProps> = ({
  visible,
  onClose,
  title,
  onTitleChange,
  artist,
  onArtistChange,
  onSave,
  primaryColor,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.container}>
          <Frosted radius={26} intensity={60} tint={0.5} />
          <Text style={styles.heading}>Edit song</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={onTitleChange}
            style={styles.input}
            placeholder="Title"
            placeholderTextColor={Signal.inkFaint}
            selectionColor={Signal.wave}
          />

          <Text style={styles.label}>Artist</Text>
          <TextInput
            value={artist}
            onChangeText={onArtistChange}
            style={styles.input}
            placeholder="Artist"
            placeholderTextColor={Signal.inkFaint}
            selectionColor={Signal.wave}
          />

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveBtn, { backgroundColor: primaryColor }]} onPress={onSave}>
              <Text style={styles.saveBtnText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Glass.scrim, justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { borderRadius: 26, overflow: 'hidden', padding: 24, width: '100%', maxWidth: 360 },
  heading: { fontSize: 20, fontWeight: '700', color: Signal.ink, marginBottom: 18, textAlign: 'center' },
  label: { color: Signal.inkMuted, marginBottom: 8, marginLeft: 4, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: Glass.fillLight, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong, color: Signal.ink, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, fontSize: 16 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 999, backgroundColor: Glass.fillLight, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong, alignItems: 'center' },
  cancelBtnText: { color: Signal.ink, fontWeight: '600', fontSize: 16 },
  saveBtn: { flex: 1, padding: 14, borderRadius: 999, alignItems: 'center' },
  saveBtnText: { color: Signal.waveInk, fontWeight: '700', fontSize: 16 },
});

export default React.memo(LibraryEditModal);
