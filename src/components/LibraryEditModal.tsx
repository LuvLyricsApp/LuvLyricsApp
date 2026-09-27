import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal, TextInput } from 'react-native';

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
        <View style={styles.container}>
          <Text style={styles.heading}>Edit Song Info</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={onTitleChange}
            style={styles.input}
            placeholder="Song Title"
            placeholderTextColor="#666"
          />

          <Text style={styles.label}>Artist</Text>
          <TextInput
            value={artist}
            onChangeText={onArtistChange}
            style={styles.input}
            placeholder="Artist Name"
            placeholderTextColor="#666"
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { backgroundColor: '#1E1E1E', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 },
  heading: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' },
  label: { color: '#aaa', marginBottom: 8, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: '#333', color: '#fff', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 16 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#333', alignItems: 'center' },
  cancelBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});

export default React.memo(LibraryEditModal);
