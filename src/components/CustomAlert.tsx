/**
 * Alert dialog on Allegra's floating glass: a frosted card, the primary
 * action in the signal colour, cancel as a quiet glass button.
 */

import React from 'react';
import { StyleSheet, View, Text, Modal, Pressable } from 'react-native';
import { Frosted } from './allegra/Frosted';
import { Glass, Signal } from '../constants/allegraTheme';

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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />

      <View style={styles.container}>
        <View style={styles.alertBox}>
          <Frosted radius={26} intensity={60} tint={0.5} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

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
    backgroundColor: Glass.scrim,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertBox: {
    borderRadius: 26,
    overflow: 'hidden',
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
    color: Signal.ink,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
    color: Signal.inkSoft,
  },
  buttons: {
    gap: 10,
  },
  button: {
    backgroundColor: Signal.wave,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  buttonCancel: {
    backgroundColor: Glass.fillLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
  },
  buttonDestructive: {
    backgroundColor: Signal.accent,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Signal.waveInk,
  },
  buttonTextCancel: {
    color: Signal.ink,
  },
  buttonTextDestructive: {
    color: '#fff',
  },
});
