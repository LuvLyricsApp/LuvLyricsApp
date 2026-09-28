/**
 * Luvs languages: a frosted sheet of chips, at least one always on.
 */

import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLuvsPreferencesStore, LuvLanguage } from '../store/luvsPreferencesStore';
import { luvsEngine } from '../services/luvsEngine';
import { Frosted } from './allegra/Frosted';
import { Glass, Signal } from '../constants/allegraTheme';

const AVAILABLE_LANGUAGES: LuvLanguage[] = [
  'English', 'Hindi', 'Tamil', 'Telugu', 'Punjabi',
  'Korean', 'Kannada', 'Malayalam', 'Bengali', 'Marathi',
];

interface LanguagePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

export const LanguagePickerModal: React.FC<LanguagePickerModalProps> = ({ visible, onClose }) => {
  const preferredLanguages = useLuvsPreferencesStore(s => s.preferredLanguages);
  const setPreferredLanguages = useLuvsPreferencesStore(s => s.setPreferredLanguages);
  const [selectedLanguages, setSelectedLanguages] = useState<LuvLanguage[]>(() =>
    preferredLanguages.filter(l => l.weight > 0).map(l => l.language)
  );

  const toggleLanguage = (language: LuvLanguage) => {
    if (selectedLanguages.includes(language)) {
      if (selectedLanguages.length === 1) return;
      setSelectedLanguages(selectedLanguages.filter(l => l !== language));
    } else {
      setSelectedLanguages([...selectedLanguages, language]);
    }
  };

  const handleSave = () => {
    setPreferredLanguages(selectedLanguages);
    // The native engine keeps its own persisted copy, so it has to be told too —
    // the next feed it builds is filtered against this list.
    luvsEngine.setLanguages(selectedLanguages);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalContent}>
          <Frosted radius={28} intensity={60} tint={0.55} />
          <View style={styles.header}>
            <Text style={styles.title}>Languages for Luvs</Text>
            <Text style={styles.subtitle}>Luvs mixes songs in the ones you pick.</Text>
          </View>

          <ScrollView style={styles.languageList} contentContainerStyle={styles.chips} showsVerticalScrollIndicator={false}>
            {AVAILABLE_LANGUAGES.map((language) => {
              const isSelected = selectedLanguages.includes(language);
              return (
                <Pressable
                  key={language}
                  style={[styles.chip, isSelected && styles.chipOn]}
                  onPress={() => toggleLanguage(language)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                >
                  {isSelected ? <Ionicons name="checkmark" size={16} color={Signal.waveInk} /> : null}
                  <Text style={[styles.chipText, isSelected && styles.chipTextOn]}>{language}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: Glass.scrim, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', paddingTop: 24, paddingHorizontal: 20, paddingBottom: 36, maxHeight: '70%' },
  header: { marginBottom: 18 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4, color: Signal.ink },
  subtitle: { fontSize: 14, color: Signal.inkSoft },
  languageList: { maxHeight: 360 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999, backgroundColor: Glass.fillLight, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong },
  chipOn: { backgroundColor: Signal.wave, borderColor: Signal.wave },
  chipText: { fontSize: 15, fontWeight: '600', color: Signal.ink },
  chipTextOn: { color: Signal.waveInk },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 999, backgroundColor: Glass.fillLight, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong, alignItems: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600', color: Signal.ink },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 999, alignItems: 'center', backgroundColor: Signal.wave },
  saveText: { fontSize: 16, color: Signal.waveInk, fontWeight: '700' },
});
