/**
 * Mounted once at the root: runs the Listen Together client and player sync
 * for the whole app, and surfaces what can't wait for the room sheet — a
 * join request (Let in / Decline, like Echo's notification) and room news.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Frosted from '../allegra/Frosted';
import { Toast } from '../Toast';
import { Signal } from '../../constants/allegraTheme';
import * as Haptics from '../../utils/haptics';
import { useListenTogetherStore } from '../../store/listenTogetherStore';
import { approveJoin, rejectJoin, startListenTogetherClient } from '../../services/listenTogether/client';
import { startListenTogetherSync } from '../../services/listenTogether/sync';

export const ListenTogetherHost: React.FC = () => {
  const insets = useSafeAreaInsets();
  const request = useListenTogetherStore(s => (s.role === 'host' ? s.joinRequests[0] : undefined));
  const notice = useListenTogetherStore(s => s.notice);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    const stopSync = startListenTogetherSync();
    const stopClient = startListenTogetherClient();
    return () => {
      stopSync();
      stopClient();
    };
  }, []);

  useEffect(() => {
    if (notice) setToast(notice);
  }, [notice]);

  useEffect(() => {
    if (request) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [request?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {request ? (
        <Animated.View
          key={request.user_id}
          entering={FadeInUp.duration(260)}
          exiting={FadeOutUp.duration(200)}
          style={[styles.card, { top: insets.top + 10 }]}
          accessibilityLiveRegion="polite"
        >
          <Frosted radius={22} intensity={60} tint={0.55} />
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>{`${request.username} wants to listen along`}</Text>
            <View style={styles.cardButtons}>
              <Pressable onPress={() => rejectJoin(request.user_id)} style={styles.btn} accessibilityRole="button">
                <Text style={styles.btnText}>Decline</Text>
              </Pressable>
              <Pressable onPress={() => approveJoin(request.user_id)} style={[styles.btn, styles.btnPrimary]} accessibilityRole="button">
                <Text style={[styles.btnText, styles.btnPrimaryText]}>Let in</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}
      <Toast
        visible={toast !== null}
        message={toast?.text ?? ''}
        type="info"
        onDismiss={() => setToast(null)}
        duration={3000}
      />
    </>
  );
};

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 12, right: 12, borderRadius: 22, overflow: 'hidden', zIndex: 60, elevation: 12 },
  cardBody: { padding: 14 },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cardButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  btn: { height: 38, paddingHorizontal: 16, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  btnPrimary: { backgroundColor: Signal.wave },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnPrimaryText: { color: Signal.waveInk },
});

export default ListenTogetherHost;
