import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, GRAD, GRAD_END, GRAD_START, GRAD_STOP, R, SHADOW } from './theme';

// ── Gradient / primary buttons ───────────────────────────────────
export function GradientButton({
  label,
  onPress,
  variant = 'grad',
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'grad' | 'stop' | 'ghost';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const off = disabled || busy;
  if (variant === 'ghost') {
    return (
      <TouchableOpacity
        style={[styles.ghost, off && styles.off, style]}
        onPress={onPress}
        disabled={off}
        activeOpacity={0.85}
      >
        <Text style={styles.ghostText}>{label}</Text>
      </TouchableOpacity>
    );
  }
  const colors = variant === 'stop' ? GRAD_STOP : GRAD;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.9}
      style={[variant === 'stop' ? SHADOW.stop : SHADOW.brand, { borderRadius: R.md }, off && styles.off, style]}
    >
      <LinearGradient
        colors={colors}
        start={GRAD_START}
        end={GRAD_END}
        style={styles.grad}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.gradText}>{label}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ── Glass card ───────────────────────────────────────────────────
export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={[styles.card, style]}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

// ── Animated recording waveform ──────────────────────────────────
export function Waveform({ bars = 20, color = C.cobalt }: { bars?: number; color?: string }) {
  const vals = useRef([...Array(bars)].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 500 + (i % 5) * 90,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(v, {
            toValue: 0.25,
            duration: 500 + (i % 4) * 80,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
      ),
    );
    loops.forEach((l, i) => setTimeout(() => l.start(), i * 40));
    return () => loops.forEach((l) => l.stop());
  }, [vals]);
  return (
    <View style={styles.wave}>
      {vals.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            borderRadius: 3,
            backgroundColor: color,
            height: v.interpolate({ inputRange: [0, 1], outputRange: [5, 24] }),
          }}
        />
      ))}
    </View>
  );
}

// ── Pulsing "live" dot for the status hero ───────────────────────
export function PulseDot({ color = '#fff' }: { color?: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(a, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View style={{ width: 12, height: 12 }}>
      <Animated.View
        style={{
          position: 'absolute',
          top: -5,
          left: -5,
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: color,
          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
          transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.7] }) }],
        }}
      />
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
    </View>
  );
}

// ── Status pill (uploaded / pending) ─────────────────────────────
export function Pill({ tone, label }: { tone: 'ok' | 'wait'; label: string }) {
  return (
    <Text
      style={[
        styles.pill,
        tone === 'ok'
          ? { color: C.ok, backgroundColor: C.okTint }
          : { color: C.waitText, backgroundColor: C.waitTint },
      ]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  grad: { borderRadius: R.md, paddingVertical: 17, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  gradText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 } as TextStyle,
  ghost: {
    borderRadius: R.md,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.line,
  },
  ghostText: { color: C.ink, fontSize: 14, fontWeight: '700' } as TextStyle,
  off: { opacity: 0.45 },
  card: {
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.md,
    padding: 15,
    ...SHADOW.card,
  },
  wave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 26, marginTop: 10 },
  pill: { fontSize: 11, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, overflow: 'hidden' },
});
