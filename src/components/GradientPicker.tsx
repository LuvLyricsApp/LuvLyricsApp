/**
 * LyricFlow - Horizontal Gradient Picker Component
 */

import React, { memo } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GRADIENTS } from '../constants/gradients';
import { useThemeColors } from '../contexts/ThemeContext';

interface GradientPickerProps {
  selectedId: string;
  onSelect: (gradientId: string) => void;
}

export const GradientPicker: React.FC<GradientPickerProps> = memo(({ selectedId, onSelect }) => {
  const colors = useThemeColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>Visual theme</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {GRADIENTS.map((gradient) => {
          const isSelected = gradient.id === selectedId;
          return (
            <Pressable key={gradient.id} style={styles.item} onPress={() => onSelect(gradient.id)}>
              <View style={[styles.thumbnailContainer, isSelected && styles.selected]}>
                <LinearGradient
                  colors={gradient.colors as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.thumbnail}
                />
                {isSelected && (
                  <View style={styles.checkContainer}>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  </View>
                )}
              </View>
              <Text style={[styles.name, { color: isSelected ? colors.textPrimary : colors.textSecondary }]}>
                {gradient.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

GradientPicker.displayName = 'GradientPicker';

const styles = StyleSheet.create({
  container: { gap: 12 },
  label: { fontSize: 13, fontWeight: '600' },
  scrollContent: { gap: 16, paddingRight: 24 },
  item: { alignItems: 'center', gap: 8 },
  thumbnailContainer: { width: 96, height: 96, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: '#fff' },
  thumbnail: { flex: 1 },
  checkContainer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  name: { fontSize: 13, fontWeight: '500' },
});

export default GradientPicker;
