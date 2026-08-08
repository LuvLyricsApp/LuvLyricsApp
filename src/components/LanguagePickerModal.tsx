/**
 * Language Preference Modal for Luvs
 */

import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLuvsPreferencesStore, LuvLanguage } from '../store/luvsPreferencesStore';
import { luvsEngine } from '../services/luvsEngine';
import { useThemeColors } from '../contexts/ThemeContext';

const AVAILABLE_LANGUAGES: LuvLanguage[] = [
  'English', 'Hindi', 'Tamil', 'Telugu', 'Punjabi',
  'Korean', 'Kannada', 'Malayalam', 'Bengali', 'Marathi',
];

interface LanguagePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

export const LanguagePickerModal: React.FC<LanguagePickerModalProps> = ({ visible, onClose }) => {
  const colors = useThemeColors();
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
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Luvs Language Preferences</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Select languages for your Luvs feed</Text>
          </View>

          <ScrollView style={styles.languageList} showsVerticalScrollIndicator={false}>
            {AVAILABLE_LANGUAGES.map((language) => {
              const isSelected = selectedLanguages.includes(language);
              return (
                <Pressable
                  key={language}
                  style={[styles.languageOption, isSelected && { backgroundColor: 'rgba(10,132,255,0.15)', borderWidth: 1, borderColor: colors.primary }]}
                  onPress={() => toggleLanguage(language)}
                >
                  <View style={styles.languageRow}>
                    <Text style={[styles.languageName, { color: isSelected ? colors.primary : colors.textPrimary }, isSelected && { fontWeight: '600' }]}>
                      {language}
                    </Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={24} color={colors.primary} />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={handleSave}>
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 40, maxHeight: '70%' },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 14 },
  languageList: { maxHeight: 400 },
  languageOption: { paddingVertical: 16, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
  languageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  languageName: { fontSize: 18, fontWeight: '500' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600' },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
});
