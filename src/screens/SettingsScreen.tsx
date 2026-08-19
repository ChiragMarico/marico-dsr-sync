import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Updates from 'expo-updates';
import { API_MODE, APP_VERSION, BUILD_LABEL, UPLOAD_TARGET } from '../constants';
import { Props } from '../navigation';
import { Session } from '../types';
import { clearOutletCache, syncOutlets } from '../storage/outletCache';
import { clearSession } from '../storage/session';
import { checkForUpdate, UpdateStatus } from '../update/updateCheck';
import { dutyController } from '../duty/dutyController';
import { C, R, SHADOW, T } from '../ui/theme';
import { Card } from '../ui/components';
import { LanguagePicker } from '../ui/LanguagePicker';
import { useT } from '../i18n';

interface Extra {
  session: Session;
  onLoggedOut: () => void;
}

export default function SettingsScreen({ navigation, session, onLoggedOut }: Props<'Settings'> & Extra) {
  const { t } = useT();
  // Built-in dev/admin accounts authenticate through the in-process mock and
  // get `mock-token-<id>`; real DSRs from S3 get `s3-<id>`. Only the former
  // may reach recordings playback and the testing tools.
  const isAdmin = session.token.startsWith('mock-token-');
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkForUpdates = async () => {
    if (!Updates.isEnabled) {
      Alert.alert(t('updUnavailableTitle'), t('updUnavailableBody'));
      return;
    }
    setChecking(true);
    try {
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) {
        await Updates.fetchUpdateAsync();
        Alert.alert(t('updReadyTitle'), t('updReadyBody'), [
          { text: t('later'), style: 'cancel' },
          { text: t('restartNow'), onPress: () => Updates.reloadAsync() },
        ]);
      } else {
        Alert.alert(t('upToDate'), t('upToDateBody'));
      }
    } catch {
      Alert.alert(t('updCheckFailTitle'), t('checkNetBody'));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkForUpdate().then(setUpdate);
  }, []);

  const refreshOutlets = async () => {
    setSyncing(true);
    try {
      const r = await syncOutlets(session.dsr.id, session.token);
      Alert.alert(t('doneTitle'), t('outletsSynced', { n: r.outlets.length }));
    } catch {
      Alert.alert(t('failedTitle'), t('checkNetBody'));
    } finally {
      setSyncing(false);
    }
  };

  const logout = () => {
    Alert.alert(t('logOutQ'), t('logOutBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logOut'),
        style: 'destructive',
        onPress: async () => {
          await dutyController.reset(); // ends duty + wipes ALL per-DSR state
          await clearSession();
          await clearOutletCache();
          onLoggedOut();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{session.dsr.name}</Text>
      <Text style={styles.sub}>DSR ID: {session.dsr.id}</Text>

      <Text style={styles.section}>{t('changeLanguage')}</Text>
      <View style={styles.langWrap}>
        <LanguagePicker />
      </View>

      <Row label={t('refreshOutlets')} onPress={refreshOutlets} busy={syncing} />
      <Row label={t('redoSetup')} onPress={() => navigation.navigate('Onboarding', { mode: 'first-run' })} />
      <Row label={`⬇️  ${t('checkUpdates')}`} onPress={checkForUpdates} busy={checking} />
      <Row label={t('openPhoneSettings')} onPress={() => Linking.openSettings()} />

      {/* Admin-only. Field reps must not be able to play back or delete their
          own recordings — that is a Marico-side function. Dev accounts
          (1023/1024) keep both so testing tools stay usable. */}
      {isAdmin && (
        <>
          <Row label={`🎧  ${t('recordings')}`} onPress={() => navigation.navigate('Recordings')} />
          <Row label={`🎤  ${t('vpTitle')}`} onPress={() => navigation.navigate('Voiceprints')} />
          <Row label="🛠  Developer / Testing" onPress={() => navigation.navigate('DevTools')} />
        </>
      )}

      <Card style={styles.verCard}>
        <Text style={styles.verK}>{t('version')}</Text>
        <Text style={styles.verV}>
          {APP_VERSION} · {BUILD_LABEL}
        </Text>
        {update?.updateAvailable ? (
          <Text style={styles.updateTxt}>{t('updateAvailable', { v: update.latest ?? '' })}</Text>
        ) : (
          <Text style={styles.upToDate}>{t('upToDate')}</Text>
        )}
        <Text style={styles.mode}>
          Login: {API_MODE} · Uploads: {UPLOAD_TARGET}
        </Text>
      </Card>

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Text style={styles.logoutTxt}>{t('logOut')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={busy} activeOpacity={0.85}>
      <Text style={styles.rowTxt}>{label}</Text>
      {busy ? <ActivityIndicator size="small" color={C.cobalt} /> : <Text style={styles.chev}>›</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 52 },
  name: { ...T.display, fontSize: 24 },
  sub: { ...T.body, color: C.low, marginBottom: 20 },
  section: { ...T.label, marginBottom: 10 },
  langWrap: { alignItems: 'flex-start', marginBottom: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    padding: 17,
    marginBottom: 11,
    ...SHADOW.card,
  },
  rowTxt: { ...T.body, fontWeight: '700', flex: 1 },
  chev: { fontSize: 22, color: C.low },
  verCard: { marginTop: 8, marginBottom: 20 },
  verK: { ...T.caption, fontSize: 11.5 },
  verV: { ...T.h2, fontSize: 20, marginTop: 2 },
  updateTxt: { color: C.cobalt, fontSize: 14, marginTop: 8, fontWeight: '700' },
  upToDate: { color: C.ok, fontSize: 14, marginTop: 8, fontWeight: '600' },
  mode: { ...T.caption, fontSize: 12, marginTop: 8 },
  logout: {
    borderWidth: 2,
    borderColor: C.rec,
    borderRadius: R.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutTxt: { fontSize: 16, fontWeight: '700', color: C.rec },
});
