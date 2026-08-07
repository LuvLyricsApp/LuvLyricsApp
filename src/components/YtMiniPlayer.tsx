import React, { useRef, useState, useEffect } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import YoutubeIframe from 'react-native-youtube-iframe';
import { Ionicons } from '@expo/vector-icons';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_W_SMALL = 260;
const CARD_W_LARGE = SW - 32;
const CARD_H_SMALL = CARD_W_SMALL * (9 / 16);
const CARD_H_LARGE = CARD_W_LARGE * (9 / 16);
const INITIAL_X = SW - CARD_W_SMALL - 16;
const INITIAL_Y = SH * 0.35;

interface Props {
  videoId: string;
  songTitle: string;
  onClose: () => void;
  onOpen?: () => void;
  onDismiss?: () => void;
}

export const YtMiniPlayer: React.FC<Props> = ({ videoId, songTitle, onClose, onOpen, onDismiss }) => {
  const pan = useRef(new Animated.ValueXY({ x: INITIAL_X, y: INITIAL_Y })).current;
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(true);

  // All JS driver — no mixing
  const entryAnim = useRef(new Animated.Value(0)).current; // 0=hidden, 1=visible
  const animW = useRef(new Animated.Value(CARD_W_SMALL)).current;
  const animH = useRef(new Animated.Value(CARD_H_SMALL)).current;

  const entryScale = entryAnim.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });
  const entryOpacity = entryAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  useEffect(() => {
    Animated.spring(entryAnim, {
      toValue: 1, damping: 18, stiffness: 260, useNativeDriver: false,
    }).start();
    onOpen?.();
    return () => { onDismiss?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const targetW = expanded ? CARD_W_LARGE : CARD_W_SMALL;
    const targetH = expanded ? CARD_H_LARGE : CARD_H_SMALL;
    Animated.parallel([
      Animated.spring(animW, { toValue: targetW, damping: 20, stiffness: 280, useNativeDriver: false }),
      Animated.spring(animH, { toValue: targetH, damping: 20, stiffness: 280, useNativeDriver: false }),
    ]).start();
    if (expanded) {
      Animated.spring(pan, {
        toValue: { x: 16, y: (pan.y as any)._value },
        damping: 20, stiffness: 280, useNativeDriver: false,
      }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const handleClose = () => {
    Animated.timing(entryAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start(() => onClose());
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !expanded,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        const currentX = (pan.x as any)._value;
        const snapX = currentX < SW / 2 ? 16 : SW - CARD_W_SMALL - 16;
        Animated.spring(pan, {
          toValue: { x: snapX, y: (pan.y as any)._value },
          useNativeDriver: false, damping: 22, stiffness: 300,
        }).start();
      },
    })
  ).current;

  return (
    <Modal transparent animationType="none" visible onRequestClose={handleClose} statusBarTranslucent>
      <Animated.View
        style={[
          styles.card,
          {
            transform: [...pan.getTranslateTransform(), { scale: entryScale }],
            opacity: entryOpacity,
            width: animW,
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="logo-youtube" size={14} color="#FF0000" />
          <Text style={styles.title} numberOfLines={1}>{songTitle}</Text>
          <Pressable onPress={() => setPlaying(p => !p)} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name={playing ? 'pause' : 'play'} size={14} color="#aaa" />
          </Pressable>
          <Pressable onPress={() => setExpanded(e => !e)} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name={expanded ? 'contract-outline' : 'expand-outline'} size={14} color="#aaa" />
          </Pressable>
          <Pressable onPress={handleClose} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="close" size={16} color="#aaa" />
          </Pressable>
        </View>

        {/* Player */}
        <Animated.View style={[styles.playerBox, { height: animH }]}>
          <YoutubeIframe
            videoId={videoId}
            height={expanded ? CARD_H_LARGE : CARD_H_SMALL}
            width={expanded ? CARD_W_LARGE : CARD_W_SMALL}
            play={playing}
            onChangeState={(state) => {
              if (state === 'playing') setPlaying(true);
              if (state === 'paused' || state === 'ended') setPlaying(false);
            }}
            webViewProps={{
              allowsInlineMediaPlayback: true,
              mediaPlaybackRequiresUserAction: false,
            }}
          />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    borderRadius: 14,
    backgroundColor: '#111',
    overflow: 'hidden',
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
  },
  header: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 6,
    backgroundColor: '#1a1a1a',
  },
  title: {
    flex: 1,
    fontSize: 12,
    color: '#ddd',
    fontWeight: '600',
  },
  headerBtn: {
    paddingHorizontal: 4,
  },
  playerBox: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
});
