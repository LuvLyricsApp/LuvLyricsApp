/**
 * LyricFlow - Custom Alert Modal
 * Dark-themed alert dialog
 */

import React from 'react';
import { StyleSheet, View, Text, Modal, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { useThemeColors } from '../contexts/ThemeContext';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons: Array<{
    text: string;
    onPress: () => void;
    style?: 'default' | 'cancel' | 'destructive';
  }>;
  onClose: () => void;
}

export const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  buttons,
  onClose,
}) => {
  const colors = useThemeColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      </Pressable>

      <View style={styles.container}>
        <View style={[styles.alertBox, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

          <View style={styles.buttons}>
            {buttons.map((button, index) => (
              <Pressable
                key={index}
                style={[
                  styles.button,
                  button.style === 'cancel' && styles.buttonCancel,
                  button.style === 'destructive' && styles.buttonDestructive,
                ]}
                onPress={() => {
                  button.onPress();
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === 'cancel' && styles.buttonTextCancel,
                    button.style === 'destructive' && styles.buttonTextDestructive,
                  ]}
                >
                  {button.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertBox: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  buttons: {
    gap: 12,
  },
  button: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonCancel: {
    backgroundColor: '#1A1A1A',
  },
  buttonDestructive: {
    backgroundColor: '#FF453A',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  buttonTextCancel: {
    color: '#fff',
  },
  buttonTextDestructive: {
    color: '#fff',
  },
});
