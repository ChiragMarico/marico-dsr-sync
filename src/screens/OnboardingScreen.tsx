import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Props } from '../navigation';
import { Session } from '../types';
import {
  checkPreconditions,
  PreconditionStatus,
  requestLocationForeground,
  requestLocationBackground,
  requestMic,
  requestNotifications,
} from '../permissions/permissions';
import { requestBatteryExemption, openAutostart, openAppLocationSettings } from '../permissions/autoSetup';
import { markOnboarded, saveConsent } from '../onboarding/consent';
import { runVoiceEnrollment, ENROLL_SECONDS } from '../onboarding/voiceEnrollment';
import { C, T } from '../ui/theme';
import { Card, GradientButton } from '../ui/components';
import { LanguagePicker } from '../ui/LanguagePicker';
import { useT } from '../i18n';

interface Extra {
  session: Session;
  onDone: () => void;
}

type StepId =
  | 'language'
  | 'consent'
  | 'mic'
  | 'location'
  | 'notifications'
  | 'battery'
  | 'bluetooth'
  | 'voice';

export default function OnboardingScreen({ navigation, route, session, onDone }: Props<'Onboarding'> & Extra) {
  const { t } = useT();
  const mode = route.params?.mode ?? 'first-run';
  const steps: StepId[] = useMemo(
    () =>
      mode === 'repair'
        ? ['mic', 'location', 'notifications', 'battery']
        : ['language', 'consent', 'mic', 'location', 'notifications', 'battery', 'bluetooth', 'voice'],
    [mode],
  );
  const [i, setI] = useState(0);
  const [pre, setPre] = useState<PreconditionStatus | null>(null);
  const [batteryDone, setBatteryDone] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'running' | 'uploading' | 'ok' | 'fail'>('idle');
  // Seconds remaining while the rep speaks — without a visible countdown they
  // stop talking after a few seconds and the sample is unusable.
  const [secsLeft, setSecsLeft] = useState(ENROLL_SECONDS);
  const [veError, setVeError] = useState('');
  const [working, setWorking] = useState(false);

  const refresh = async () => setPre(await checkPreconditions());
  useEffect(() => {
    refresh();
  }, []);

  // Re-check permissions whenever the user comes back from the OS settings page
  // (that's how "Allow all the time" gets granted on Android 11+).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, []);

  // Back (header arrow OR hardware button) goes ONE step back, not out of the
  // whole wizard. Only step 1 actually leaves the screen.
  const iRef = useRef(0);
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: { preventDefault: () => void }) => {
      if (iRef.current > 0) {
        e.preventDefault();
        setI((x) => Math.max(0, x - 1));
      }
    });
    return unsub;
  }, [navigation]);

  const step = steps[i];
  iRef.current = i;
  const next = () => (i < steps.length - 1 ? setI(i + 1) : finish());
  const finish = async () => {
    await markOnboarded();
    onDone();
    iRef.current = 0; // done — let the goBack below actually leave the wizard
    navigation.goBack();
  };
  const doRequest = async (fn: () => Promise<boolean>) => {
    setWorking(true);
    await fn();
    await refresh();
    setWorking(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.prog}>
        {steps.map((_, idx) => (
          <View key={idx} style={[styles.progBar, idx <= i && styles.progOn]} />
        ))}
      </View>

      <Card style={styles.card}>
        {step === 'language' && (
          <>
            <Text style={styles.title}>{t('chooseLanguage')}</Text>
            <View style={{ height: 10 }} />
            <LanguagePicker size="lg" />
            <View style={{ height: 24 }} />
            <GradientButton label={t('next')} onPress={next} />
          </>
        )}

        {step === 'consent' && (
          <>
            <Text style={styles.title}>{t('obWelcomeTitle')}</Text>
            <Text style={styles.body}>{t('obWelcomeBody')}</Text>
            <GradientButton
              label={t('obAgree')}
              onPress={async () => {
                await saveConsent();
                next();
              }}
            />
          </>
        )}

        {step === 'mic' && (
          <>
            <Text style={styles.title}>{t('obMicTitle')}</Text>
            <Text style={styles.body}>{t('obMicBody')}</Text>
            <StatusLine ok={!!pre?.mic} label={t('obMicStatus')} />
            <GradientButton
              label={pre?.mic ? t('done') : t('obAllowMic')}
              onPress={pre?.mic ? next : () => doRequest(requestMic)}
              busy={working}
            />
          </>
        )}

        {step === 'location' && (
          <>
            <Text style={styles.title}>{t('obLocTitle')}</Text>
            <StatusLine ok={!!pre?.locationAlways} label={t('obLocStatus')} />
            {pre?.locationAlways ? (
              // Fully granted → move on.
              <GradientButton label={t('done')} onPress={next} />
            ) : !pre?.locationWhenInUse ? (
              // Step 1: get the foreground dialog (this always shows a pop-up).
              <>
                <Text style={styles.body}>{t('obLocBody')}</Text>
                <GradientButton
                  label={t('obAllowLoc')}
                  onPress={() => doRequest(requestLocationForeground)}
                  busy={working}
                />
              </>
            ) : (
              // Step 2: "all the time". Try the dialog (Android 10); if it can't
              // grant (Android 11+), open the settings page for a manual pick.
              <>
                <Text style={styles.body}>{t('obLocStep2Body')}</Text>
                <GradientButton
                  label={t('obLocAllTime')}
                  busy={working}
                  onPress={async () => {
                    setWorking(true);
                    const ok = await requestLocationBackground();
                    await refresh();
                    setWorking(false);
                    if (!ok) await openAppLocationSettings();
                  }}
                />
                <GradientButton
                  label={t('obLocOpenSettings')}
                  variant="ghost"
                  onPress={() => openAppLocationSettings()}
                  style={{ marginTop: 12 }}
                />
              </>
            )}
            {!pre?.gps && <Text style={styles.warn}>{t('obGpsOff')}</Text>}
          </>
        )}

        {step === 'notifications' && (
          <>
            <Text style={styles.title}>{t('obNotifTitle')}</Text>
            <Text style={styles.body}>{t('obNotifBody')}</Text>
            <StatusLine ok={!!pre?.notifications} label={t('obNotifStatus')} />
            <GradientButton
              label={pre?.notifications ? t('done') : t('obAllowNotif')}
              onPress={pre?.notifications ? next : () => doRequest(requestNotifications)}
              busy={working}
            />
          </>
        )}

        {step === 'battery' && (
          <>
            <Text style={styles.title}>{t('obBatteryTitle')}</Text>
            <Text style={styles.body}>{t('obBatteryBody')}</Text>
            {/* One tap: the app fires the system "allow background" dialog itself. */}
            <GradientButton
              label={batteryDone ? t('obBatteryDone') : t('obBatteryOneTap')}
              onPress={async () => {
                await requestBatteryExemption();
                setBatteryDone(true);
              }}
            />
            <Text style={[styles.body, { marginTop: 18 }]}>{t('obAutostartBody')}</Text>
            <GradientButton label={t('obOpenAutostart')} variant="ghost" onPress={() => openAutostart()} />
            <GradientButton label={t('next')} onPress={next} disabled={!batteryDone} style={{ marginTop: 12 }} />
          </>
        )}

        {step === 'bluetooth' && (
          <>
            <Text style={styles.title}>{t('obBtTitle')}</Text>
            <Text style={styles.body}>{t('obBtBody')}</Text>
            <GradientButton label={t('next')} onPress={next} />
          </>
        )}

        {step === 'voice' && (
          <>
            <Text style={styles.title}>{t('veTitle')}</Text>
            <Text style={styles.body}>{t('veBody')}</Text>

            {/* What to talk about. Large and high-contrast — the rep reads this
                at arm's length while speaking. */}
            <View style={styles.scriptBox}>
              <Text style={styles.scriptTxt}>{t('veScript')}</Text>
            </View>

            {testState === 'ok' && <Text style={styles.okTxt}>{t('veSuccess')}</Text>}
            {testState === 'fail' && (
              <Text style={styles.warn}>{t('veFailed', { e: veError })}</Text>
            )}

            {testState === 'running' ? (
              <View style={styles.recBox}>
                <Text style={styles.recNow}>{t('veRecording')}</Text>
                <Text style={styles.recCount}>{t('veSecondsLeft', { s: secsLeft })}</Text>
              </View>
            ) : testState === 'uploading' ? (
              <View style={styles.running}>
                <ActivityIndicator color={C.cobalt} />
                <Text style={styles.runningTxt}>{t('veUploading')}</Text>
              </View>
            ) : testState === 'ok' ? (
              <GradientButton label={t('obFinish')} onPress={finish} />
            ) : (
              <>
                <GradientButton
                  label={testState === 'fail' ? t('veRetry') : t('veStart')}
                  onPress={async () => {
                    setVeError('');
                    setSecsLeft(ENROLL_SECONDS);
                    setTestState('running');
                    try {
                      // Recording and upload are ONE action — there is no state
                      // where the rep thinks they are done but nothing was sent.
                      const res = await runVoiceEnrollment(session, (left) => {
                        setSecsLeft(left);
                        if (left === 0) setTestState('uploading');
                      });
                      if (res.ok) setTestState('ok');
                      else {
                        setVeError(res.error ?? 'unknown');
                        setTestState('fail');
                      }
                    } catch (e) {
                      setVeError(e instanceof Error ? e.message : String(e));
                      setTestState('fail');
                    }
                  }}
                />
                <Text style={styles.veWhy}>{t('veWhy')}</Text>
              </>
            )}
          </>
        )}
      </Card>
    </ScrollView>
  );
}

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.status}>
      <View style={[styles.statusBox, ok && styles.statusBoxOk]}>
        {ok && (
          <Svg width={12} height={12} viewBox="0 0 24 24">
            <Path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        )}
      </View>
      <Text style={[styles.statusTxt, ok && { color: C.ok }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 52 },
  prog: { flexDirection: 'row', gap: 5, marginBottom: 20 },
  progBar: { height: 4, flex: 1, borderRadius: 4, backgroundColor: C.line },
  progOn: { backgroundColor: C.cobalt },
  card: { padding: 22, gap: 4 },
  title: { ...T.h1, fontSize: 21, marginBottom: 8 },
  body: { ...T.body, color: C.mid, lineHeight: 22, marginBottom: 14 },
  warn: { color: C.waitText, fontSize: 14, marginTop: 12, lineHeight: 20 },
  okTxt: { color: C.ok, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  running: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  runningTxt: { ...T.body, fontWeight: '600' },
  scriptBox: {
    backgroundColor: 'rgba(28,90,168,0.07)',
    borderLeftWidth: 3,
    borderLeftColor: C.cobalt,
    borderRadius: 10,
    padding: 16,
    marginBottom: 18,
  },
  scriptTxt: { ...T.body, fontSize: 19, lineHeight: 29, fontWeight: '600', color: C.ink },
  scriptBoxFree: {
    backgroundColor: 'rgba(127,194,65,0.10)',
    borderLeftColor: C.lima,
  },
  passHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  passOf: { ...T.caption, fontSize: 13, fontWeight: '700' },
  passKind: { ...T.caption, fontSize: 13, color: C.cobalt, fontWeight: '700' },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  navBtn: { flex: 1 },
  recBox: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: 'rgba(255,90,77,0.08)',
    borderRadius: 12,
    marginBottom: 14,
  },
  recNow: { ...T.body, fontSize: 17, fontWeight: '700', color: C.rec },
  recCount: { fontSize: 34, fontWeight: '800', color: C.rec, marginTop: 6, fontVariant: ['tabular-nums'] },
  veWhy: { ...T.caption, fontSize: 13, textAlign: 'center', marginTop: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  statusBox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.6, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  statusBoxOk: { backgroundColor: C.ok, borderColor: C.ok },
  statusTxt: { ...T.body, fontWeight: '600', color: C.mid },
});
