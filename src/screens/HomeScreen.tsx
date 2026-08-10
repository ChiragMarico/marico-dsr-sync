import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { dutyController, DutyUiState } from '../duty/dutyController';
import { checkPreconditions, allGranted } from '../permissions/permissions';
import { syncOutlets } from '../storage/outletCache';
import { isOnboarded } from '../onboarding/consent';
import { Outlet, Session } from '../types';
import { Props } from '../navigation';
import { C, GRAD, GRAD_END, GRAD_START, R, SHADOW, T } from '../ui/theme';
import { Card, GradientButton, PulseDot, Waveform } from '../ui/components';
import { CurtainTransition } from '../ui/CurtainTransition';
import { useT } from '../i18n';

interface Extra {
  session: Session;
}

/**
 * "SYNC" wordmark rendered as SVG text with the brand green→blue gradient fill —
 * a designed logotype look without needing a bundled custom font (so it ships
 * over-the-air). A rounded, condensed system face keeps it clean.
 */
function SyncWordmark() {
  return (
    <Svg width={98} height={30}>
      <Defs>
        <SvgGrad id="syncgrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#8CC63F" />
          <Stop offset="0.55" stopColor="#2E86C9" />
          <Stop offset="1" stopColor="#1C5AA8" />
        </SvgGrad>
      </Defs>
      <SvgText
        x={0}
        y={23}
        fontSize={27}
        fontWeight="900"
        letterSpacing={1.5}
        fill="url(#syncgrad)"
        fontFamily={Platform.OS === 'android' ? 'sans-serif-condensed' : 'System'}
      >
        SYNC
      </SvgText>
    </Svg>
  );
}

export default function HomeScreen({ navigation, session }: Props<'Home'> & Extra) {
  const { t } = useT();
  const [duty, setDuty] = useState<DutyUiState>(dutyController.getState());
  const [outlets, setOutlets] = useState<Outlet[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState('00:00');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [curtain, setCurtain] = useState<{
    message: string;
    icon: string;
    action: () => Promise<void>;
  } | null>(null);

  useEffect(() => dutyController.subscribe(setDuty), []);

  const loadOutlets = useCallback(async () => {
    try {
      const r = await syncOutlets(session.dsr.id, session.token);
      setOutlets(r.outlets);
    } catch {
      /* keep whatever we had */
    }
  }, [session]);

  useEffect(() => {
    loadOutlets();
  }, [loadOutlets]);

  useEffect(() => {
    isOnboarded().then((done) => {
      if (!done) navigation.navigate('Onboarding', { mode: 'first-run' });
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      dutyController.onAppForeground();
    }, []),
  );

  useEffect(() => {
    if (!duty.recording || !duty.recordingStartedAt) {
      setElapsed('00:00');
      return;
    }
    const tick = () => {
      const s = Math.floor((Date.now() - duty.recordingStartedAt!) / 1000);
      setElapsed(
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [duty.recording, duty.recordingStartedAt]);

  // Live countdown while arriving (about to start) or leaving (about to stop).
  useEffect(() => {
    if (!duty.confirmKind || !duty.confirmStartedAt) {
      setCountdown(null);
      return;
    }
    const tick = () => {
      const rem = Math.ceil(duty.confirmTotalS - (Date.now() - duty.confirmStartedAt!) / 1000);
      setCountdown(Math.max(0, rem));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [duty.confirmKind, duty.confirmStartedAt, duty.confirmTotalS]);

  const beginDay = async () => {
    setBusy(true);
    try {
      const pre = await checkPreconditions();
      if (!allGranted(pre)) {
        navigation.navigate('Onboarding', { mode: 'repair' });
        return;
      }
      let list = outlets;
      if (!list || list.length === 0) {
        const r = await syncOutlets(session.dsr.id, session.token);
        list = r.outlets;
        setOutlets(list);
      }
      if (!list || list.length === 0) {
        Alert.alert(t('noOutletsTitle'), t('noOutletsBody'));
        return;
      }
      const l = list;
      // Curtain closes → start the day behind it → curtain re-opens on duty.
      setCurtain({
        message: t('dayBegun'),
        icon: '🌅',
        action: async () => {
          await dutyController.startDuty(session, l);
        },
      });
    } catch (e) {
      Alert.alert(t('couldNotStart'), String(e));
    } finally {
      setBusy(false);
    }
  };

  const endDay = () => {
    setCurtain({
      message: t('dayWrapped'),
      icon: '🌙',
      action: async () => {
        await dutyController.endDuty();
      },
    });
  };

  const forceRecord = () => {
    const outlet = dutyController.forceRecordHere();
    if (!outlet) Alert.alert(t('noNearbyOutlet'));
    else Alert.alert(t('recordingStarted'), outlet.name);
  };

  const forceStop = () => {
    Alert.alert(t('stopRecordingQ'), '', [
      { text: t('no'), style: 'cancel' },
      { text: t('yesStop'), style: 'destructive', onPress: () => dutyController.forceStop() },
    ]);
  };

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <View style={styles.brandLock}>
          <Image
            source={require('../../assets/sync-logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
          <View>
            <SyncWordmark />
            <Text style={styles.poweredBy}>powered by Marico AI</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.av} onPress={() => navigation.navigate('Settings')}>
          <LinearGradient colors={GRAD} start={GRAD_START} end={GRAD_END} style={styles.avGrad}>
            <Text style={styles.avText}>{initials(session.dsr.name)}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {!duty.locationOk && duty.onDuty && (
        <TouchableOpacity
          style={styles.errBanner}
          onPress={() => navigation.navigate('Onboarding', { mode: 'repair' })}
        >
          <Text style={styles.errText}>{t('locationOffBanner')}</Text>
        </TouchableOpacity>
      )}

      {/* Status hero */}
      {duty.onDuty ? (
        <LinearGradient colors={GRAD} start={GRAD_START} end={GRAD_END} style={[styles.hero, SHADOW.brand]}>
          <PulseDot />
          <View style={{ marginLeft: 11 }}>
            <Text style={styles.heroT1}>{t('onDuty')}</Text>
            <Text style={styles.heroT2}>{t('trackingVisits')}</Text>
          </View>
          {duty.startedAt && (
            <Text style={styles.heroSince}>
              {t('since')}{'\n'}
              {new Date(duty.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </LinearGradient>
      ) : (
        <Card style={styles.heroOff}>
          <View style={styles.dotOff} />
          <View style={{ marginLeft: 11 }}>
            <Text style={styles.heroOffT1}>{t('offDuty')}</Text>
            <Text style={styles.heroOffT2}>{t('tapToBegin')}</Text>
          </View>
        </Card>
      )}

      {duty.recordingError && (
        <View style={styles.warnBanner}>
          <Text style={styles.warnText}>{duty.recordingError}</Text>
        </View>
      )}

      {/* GPS too rough to detect visits (indoors, no WiFi) — say so instead of a blank "—". */}
      {duty.onDuty && duty.signalWeak && duty.geoPhase === 'IDLE' && !duty.recording && (
        <View style={styles.warnBanner}>
          <Text style={styles.warnText}>
            {t('weakSignalBanner', { m: duty.lastAccuracyM ?? '?' })}
          </Text>
        </View>
      )}

      {duty.confirmKind && countdown !== null && (
        <View
          style={[styles.countdown, duty.confirmKind === 'leaving' && styles.countdownLeave]}
        >
          <Text style={styles.countdownLabel}>
            {duty.confirmKind === 'arriving'
              ? t('arrivingAt', { name: duty.nearestOutletName ?? t('outletFallback') })
              : t('leavingOutlet', { name: duty.recordingOutletName ?? t('outletFallback') })}
          </Text>
          <Text
            style={[styles.countdownNum, { color: duty.confirmKind === 'leaving' ? C.rec : C.cobalt }]}
          >
            {duty.confirmKind === 'arriving'
              ? t('recordingStartsIn', { s: countdown })
              : t('recordingStopsIn', { s: countdown })}
          </Text>
        </View>
      )}

      {duty.recording && (
        <View style={[styles.recCard, SHADOW.raised]}>
          <Text style={styles.recLab}>● {t('recording')}</Text>
          <Text style={styles.recWho}>{duty.recordingOutletName}</Text>
          <Text style={styles.recTime}>{elapsed}</Text>
          <Waveform bars={20} color={C.limaBright} />
        </View>
      )}

      <Card style={styles.card}>
        <Text style={styles.cardK}>{t('nearestOutlet')}</Text>
        <Text style={styles.cardV}>
          {duty.nearestOutletName
            ? `${duty.nearestOutletName} `
            : '—'}
          {duty.nearestOutletName && (
            <Text style={styles.cardU}>— {duty.nearestDistanceM ?? '?'} m</Text>
          )}
        </Text>
      </Card>

      <Card onPress={() => navigation.navigate('Outlets')} style={styles.rowCard}>
        <View>
          <Text style={styles.cardK}>{t('today')}</Text>
          <Text style={styles.cardV}>{t('outletsVisited', { n: duty.visitsToday })}</Text>
        </View>
        <Text style={styles.pending}>{t('myOutlets')} ›</Text>
      </Card>

      <View style={{ height: 8 }} />
      {duty.onDuty ? (
        <GradientButton label={t('endMyDay')} variant="stop" onPress={endDay} busy={busy} />
      ) : (
        <GradientButton label={t('startMyDay')} onPress={beginDay} busy={busy} />
      )}

      {duty.onDuty && (
        <GradientButton
          label={duty.recording ? t('stopRecording') : t('forceRecord')}
          variant="ghost"
          onPress={duty.recording ? forceStop : forceRecord}
          style={{ marginTop: 12 }}
        />
      )}
    </ScrollView>
    {curtain && (
      <CurtainTransition
        message={curtain.message}
        icon={curtain.icon}
        onClosed={curtain.action}
        onDone={() => setCurtain(null)}
      />
    )}
    </>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// One uniform text size across the whole Home page (matches the Start My Day
// button). Hierarchy comes from weight + colour, not size.
const FS = 18;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 64, gap: 16, paddingBottom: 32 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  brandLock: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logoImg: { width: 56, height: 56 },
  poweredBy: { fontSize: 12, color: C.low, fontWeight: '600', letterSpacing: 0.4, marginTop: 1 },
  av: { borderRadius: 22 },
  avGrad: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avText: { color: '#fff', fontSize: FS, fontWeight: '800' },
  errBanner: { backgroundColor: '#FDECEA', borderRadius: R.md, padding: 16 },
  errText: { color: C.recDeep, fontSize: FS, fontWeight: '700', lineHeight: 25 },
  warnBanner: { backgroundColor: '#FFF3D6', borderRadius: R.md, padding: 16, borderWidth: 1, borderColor: '#FFE2A8' },
  warnText: { color: C.waitText, fontSize: FS, fontWeight: '600', lineHeight: 25 },
  hero: { flexDirection: 'row', alignItems: 'center', borderRadius: R.lg, padding: 22 },
  heroT1: { color: '#fff', fontSize: FS, fontWeight: '800', letterSpacing: 0.2 },
  heroT2: { color: 'rgba(255,255,255,0.92)', fontSize: FS, fontWeight: '500', marginTop: 3 },
  heroSince: { marginLeft: 'auto', color: 'rgba(255,255,255,0.92)', fontSize: FS, textAlign: 'right', lineHeight: 22 },
  heroOff: { flexDirection: 'row', alignItems: 'center', padding: 22 },
  dotOff: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.low },
  heroOffT1: { ...T.h2, fontSize: FS },
  heroOffT2: { ...T.caption, fontSize: FS, fontWeight: '500', marginTop: 3 },
  countdown: {
    borderRadius: R.lg,
    padding: 22,
    alignItems: 'center',
    backgroundColor: 'rgba(43,92,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(43,92,255,0.25)',
  },
  countdownLeave: {
    backgroundColor: 'rgba(255,90,77,0.08)',
    borderColor: 'rgba(255,90,77,0.25)',
  },
  countdownLabel: { ...T.body, fontSize: FS, fontWeight: '700' },
  countdownNum: { fontSize: FS, fontWeight: '800', marginTop: 6, letterSpacing: 0.2 },
  recCard: { borderRadius: R.lg, padding: 24, alignItems: 'center', backgroundColor: '#12162A' },
  recLab: { color: C.rec, fontSize: FS, fontWeight: '800', letterSpacing: 1 },
  recWho: { color: '#fff', fontSize: FS, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  recTime: { color: C.limaBright, fontSize: FS, fontWeight: '800', marginTop: 6, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  card: { paddingVertical: 20 },
  cardK: { ...T.caption, fontSize: FS },
  cardV: { ...T.h2, fontSize: FS, marginTop: 5 },
  cardU: { color: C.low, fontWeight: '600' },
  rowCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  pending: { color: C.cobalt, fontSize: FS, fontWeight: '700' },
});
