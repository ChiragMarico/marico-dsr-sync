import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GRAD, GRAD_END, GRAD_START } from './theme';

/**
 * Two curtains close (top slides down, bottom slides up) to meet in the middle,
 * reveal a message, then open again. `onClosed` runs while fully closed (do the
 * work behind the curtain); `onDone` fires after they re-open.
 */
export function CurtainTransition({
  message,
  icon,
  onClosed,
  onDone,
}: {
  message: string;
  icon?: string;
  onClosed: () => Promise<void> | void;
  onDone: () => void;
}) {
  const t = useRef(new Animated.Value(0)).current; // 0 = open, 1 = closed
  const H = Dimensions.get('window').height;
  const panelH = H / 2 + 2;

  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(async () => {
      try {
        await onClosed();
      } catch {
        /* surfaced elsewhere */
      }
      setTimeout(() => {
        Animated.timing(t, {
          toValue: 0,
          duration: 480,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => onDone());
      }, 850);
    });
  }, []);

  const topY = t.interpolate({ inputRange: [0, 1], outputRange: [-panelH, 0] });
  const bottomY = t.interpolate({ inputRange: [0, 1], outputRange: [panelH, 0] });
  const msgOpacity = t.interpolate({ inputRange: [0, 0.65, 1], outputRange: [0, 0, 1] });
  // Icon pops in with a slight overshoot once the curtains meet.
  const iconScale = t.interpolate({
    inputRange: [0, 0.6, 0.82, 1],
    outputRange: [0.4, 0.4, 1.18, 1],
  });

  return (
    <Animated.View style={styles.overlay} pointerEvents="auto">
      <Animated.View style={[styles.panel, { top: 0, height: panelH, transform: [{ translateY: topY }] }]}>
        <LinearGradient colors={GRAD} start={GRAD_START} end={GRAD_END} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View
        style={[styles.panel, { bottom: 0, height: panelH, transform: [{ translateY: bottomY }] }]}
      >
        <LinearGradient
          colors={[...GRAD].reverse() as unknown as typeof GRAD}
          start={GRAD_START}
          end={GRAD_END}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[styles.msgWrap, { opacity: msgOpacity }]} pointerEvents="none">
        {icon ? (
          <Animated.View style={[styles.iconCircle, { transform: [{ scale: iconScale }] }]}>
            <Text style={styles.icon}>{icon}</Text>
          </Animated.View>
        ) : null}
        <Text style={styles.msg}>{message}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: { position: 'absolute', left: 0, right: 0 },
  msgWrap: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  iconCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  icon: { fontSize: 56, textAlign: 'center' },
  msg: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center', letterSpacing: 0.2, lineHeight: 32 },
});
