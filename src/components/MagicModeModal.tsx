import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';


interface MagicModeModalProps {
  visible: boolean;
  onClose: () => void;
  onMagicMode: () => void;
  onPureMagicMode: () => void;
}

export const MagicModeModal: React.FC<MagicModeModalProps> = ({
  visible,
  onClose,
  onMagicMode,
  onPureMagicMode,
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          
          <Text style={styles.modalTitle}>Choose Your Magic Level</Text>
          <Text style={styles.modalSubtitle}>
            How would you like to timestamp your lyrics?
          </Text>
          
          {/* Option 1: Magic Mode (User provides lyrics) */}
          <Pressable
            style={styles.modeOption}
            onPress={onMagicMode}
          >
            <View style={styles.modeIconContainer}>
              <Ionicons name="create-outline" size={32} color="#EDEDED" />
            </View>
            <View style={styles.modeTextContainer}>
              <Text style={styles.modeTitle}>🪄 Magic</Text>
              <Text style={styles.modeDescription}>
                I have lyrics, just add timestamps
              </Text>
              <Text style={styles.modeTime}>⏱️ ~60 seconds</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
          </Pressable>
          
          {/* Option 2: Pure Magic (AI extracts everything) */}
          <Pressable
            style={styles.modeOption}
            onPress={onPureMagicMode}
          >
            <View style={styles.modeIconContainer}>
              <Ionicons name="sparkles" size={32} color="#EDEDED" />
            </View>
            <View style={styles.modeTextContainer}>
              <Text style={styles.modeTitle}>✨ Pure Magic</Text>
              <Text style={styles.modeDescription}>
                AI extracts lyrics + timestamps automatically
              </Text>
              <Text style={styles.modeTime}>⏱️ ~90 seconds</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
          </Pressable>
          
          {/* Cancel Button */}
          <Pressable
            style={styles.modalCancelButton}
            onPress={onClose}
          >
            <Text style={styles.modalCancelText}>Cancel</Text>
          </Pressable>
          
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 24,
    textAlign: 'center',
  },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262626',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  modeTextContainer: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  modeDescription: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  modeTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  modalCancelButton: {
    marginTop: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
  },
});
