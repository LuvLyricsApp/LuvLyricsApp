/**
 * New playlist / rename: a frosted card over the page, the name field and
 * Cancel · Create. The card rises in on open; the keyboard pushes it up.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { usePlaylistStore } from '../store/playlistStore';
import { safeGoBack } from '../utils/navigationService';
import * as Haptics from '../utils/haptics';
import { Frosted } from './allegra/Frosted';
import { RiseIn, Tactile } from './allegra/motion';
import { Glass, Radius, Signal, Space } from '../constants/allegraTheme';
import type { RootStackParamList } from '../types/navigation';

export const CreatePlaylistModal = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'CreatePlaylist'>>();
  const params = route.params;
  const isEditMode = !!params?.playlistId;

  const [name, setName] = useState(params?.initialName || '');
  const [failed, setFailed] = useState(false);

  const createPlaylist = usePlaylistStore(state => state.createPlaylist);
  const updatePlaylist = usePlaylistStore(state => state.updatePlaylist);
  const ready = name.trim().length > 0;

  const handleCreate = async () => {
    if (!ready) return;
    setFailed(false);
    try {
      if (isEditMode && params?.playlistId) {
        await updatePlaylist(params.playlistId, { name: name.trim() });
      } else {
        await createPlaylist(name.trim());
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      safeGoBack(navigation);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setFailed(true);
    }
  };

  return (
    <View style={styles.container}>
      {/* Tap outside the card to dismiss. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => safeGoBack(navigation)} accessibilityLabel="Close" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        pointerEvents="box-none"
      >
        <RiseIn>
          <View style={styles.card}>
            <Frosted radius={Radius.sheet} intensity={60} tint={0.55} />
            <Text style={styles.title}>{isEditMode ? 'Rename playlist' : 'New playlist'}</Text>
            <Text style={styles.subtitle}>
              {failed
                ? `Couldn't ${isEditMode ? 'rename' : 'create'} the playlist. Try again.`
                : isEditMode ? 'Give it a new name.' : 'Give your playlist a name.'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Playlist name"
              placeholderTextColor={Signal.inkFaint}
              selectionColor={Signal.wave}
              value={name}
              onChangeText={setName}
              onSubmitEditing={handleCreate}
              returnKeyType="done"
              autoFocus
            />

            <View style={styles.buttons}>
              <Tactile
                wrapperStyle={styles.buttonWrap}
                style={[styles.button, styles.cancelButton]}
                onPress={() => safeGoBack(navigation)}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Tactile>
              <Tactile
                wrapperStyle={styles.buttonWrap}
                style={[styles.button, styles.createButton, !ready && styles.disabledButton]}
                onPress={handleCreate}
                disabled={!ready}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ready }}
              >
                <Text style={styles.createText}>{isEditMode ? 'Save' : 'Create'}</Text>
              </Tactile>
            </View>
          </View>
        </RiseIn>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Glass.scrimHeavy,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    padding: Space.lg,
  },
  card: {
    borderRadius: Radius.sheet,
    padding: Space.lg,
    overflow: 'hidden',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Signal.ink,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: Signal.inkMuted,
    marginBottom: Space.lg,
  },
  input: {
    backgroundColor: Glass.fillLight,
    borderRadius: Radius.well,
    paddingHorizontal: Space.md,
    paddingVertical: 14,
    color: Signal.ink,
    fontSize: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.hairlineStrong,
    marginBottom: Space.lg,
  },
  buttons: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  buttonWrap: {
    flex: 1,
  },
  button: {
    height: 50,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: Glass.fillLight,
  },
  cancelText: {
    color: Signal.ink,
    fontWeight: '600',
    fontSize: 16,
  },
  createButton: {
    backgroundColor: Signal.wave,
  },
  disabledButton: {
    opacity: 0.4,
  },
  createText: {
    color: Signal.waveInk,
    fontWeight: '700',
    fontSize: 16,
  },
});
export default CreatePlaylistModal;
