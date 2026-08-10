import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { apiAuth } from '../api/client';
import { LOGIN_COOLDOWN_S, LOGIN_MAX_ATTEMPTS } from '../constants';
import { saveSession } from '../storage/session';
import { ApiError, Session } from '../types';
import { C, R, SHADOW, T } from '../ui/theme';
import { GradientButton } from '../ui/components';
import { LanguagePicker } from '../ui/LanguagePicker';
import { useT } from '../i18n';
import { StringKey } from '../i18n/strings';

interface Props {
  onLoggedIn: (session: Session) => void;
}

const ERROR_COPY: Record<string, StringKey> = {
  unauthorized: 'wrongIdPin',
  offline: 'noInternet',
  server: 'serverIssue',
  timeout: 'serverIssue',
};

export default function LoginScreen({ onLoggedIn }: Props) {
  const { t } = useT();
  const [dsrId, setDsrId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<StringKey | null>(null);
  const [focus, setFocus] = useState<'id' | 'pin' | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
  }, []);

  const startCooldown = () => {
    setCooldownLeft(LOGIN_COOLDOWN_S);
    cooldownTimer.current = setInterval(() => {
      setCooldownLeft((s) => {
        if (s <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          setFailedAttempts(0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const canSubmit =
    dsrId.trim().length >= 3 && pin.length === 4 && !loading && cooldownLeft === 0;

  const submit = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    try {
      const res = await apiAuth(dsrId, pin);
      const session: Session = { token: res.token, dsr: res.dsr, expires: res.expires };
      await saveSession(session);
      onLoggedIn(session);
    } catch (e) {
      const kind = e instanceof ApiError ? e.kind : 'server';
      setError(ERROR_COPY[kind]);
      if (kind === 'unauthorized') {
        const attempts = failedAttempts + 1;
        setFailedAttempts(attempts);
        if (attempts >= LOGIN_MAX_ATTEMPTS) startCooldown();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* ambient brand glow */}
      <LinearGradient
        colors={['rgba(43,92,255,0.10)', 'rgba(138,208,63,0.06)', 'transparent'] as const}
        style={styles.glow}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Image
          source={require('../../assets/sync-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.loginSub}>{t('loginSubtitle')}</Text>

        <View style={{ height: 16 }} />
        <LanguagePicker />
        <View style={{ height: 20 }} />

        <Text style={styles.label}>{t('dsrId')}</Text>
        <TextInput
          style={[styles.input, focus === 'id' && styles.inputFocus]}
          value={dsrId}
          onChangeText={(t) => setDsrId(t.replace(/[^0-9-]/g, '').slice(0, 12))}
          onFocus={() => setFocus('id')}
          onBlur={() => setFocus(null)}
          keyboardType="phone-pad"
          placeholder="e.g. 10150-3"
          placeholderTextColor={C.low}
          maxLength={12}
          editable={!loading}
          autoCapitalize="none"
          accessibilityLabel="DSR ID"
        />

        <View style={{ height: 15 }} />

        <Text style={styles.label}>{t('pin')}</Text>
        <TextInput
          style={[styles.input, styles.inputPin, focus === 'pin' && styles.inputFocus]}
          value={pin}
          onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
          onFocus={() => setFocus('pin')}
          onBlur={() => setFocus(null)}
          keyboardType="number-pad"
          placeholder="••••"
          placeholderTextColor={C.low}
          maxLength={4}
          secureTextEntry
          editable={!loading}
          accessibilityLabel="PIN"
          onSubmitEditing={submit}
        />

        {error ? <Text style={styles.error}>{t(error)}</Text> : null}
        {cooldownLeft > 0 ? (
          <Text style={styles.error}>{t('tooManyTries', { s: cooldownLeft })}</Text>
        ) : null}

        <View style={{ height: 24 }} />
        <GradientButton label={t('logIn')} onPress={submit} busy={loading} disabled={!canSubmit} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  container: { flex: 1, paddingHorizontal: 26, justifyContent: 'center' },
  logo: { width: 240, height: 240, alignSelf: 'center' },
  loginSub: { ...T.body, color: C.mid, textAlign: 'center', fontWeight: '600' },
  label: { ...T.label, marginBottom: 7 },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: R.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.ink,
    ...SHADOW.card,
  },
  inputPin: { letterSpacing: 8 },
  inputFocus: { borderColor: C.cobalt },
  error: { color: C.recDeep, fontSize: 14, textAlign: 'center', marginTop: 14, fontWeight: '600' },
});
