import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { dutyController, DutyUiState } from '../duty/dutyController';
import { loadTestOutlets } from '../storage/testOutlets';
import { Outlet, Session } from '../types';
import { Props } from '../navigation';
import { C, R, SHADOW, T } from '../ui/theme';
import { Card, GradientButton } from '../ui/components';
import { EXIT_RADIUS_M } from '../constants';
import { runSelfTest, SelfTestCycle } from '../dev/selfTest';
import { runVoiceEnrollment, ENROLL_SECONDS } from '../onboarding/voiceEnrollment';

interface Extra {
  session: Session;
}

// Walk far enough to clear the exit radius (plus margin for GPS wobble).
const WALK_M = EXIT_RADIUS_M + 5;

/**
 * Dev testing tool (PRD §13). Primary flow: save your current GPS location as a
 * dummy outlet, then physically walk out (past the exit radius) and back to
 * trigger the real geofence. Secondary: a no-move simulator for any outlet.
 */
export default function DevToolsScreen({ session }: Props<'DevTools'> & Extra) {
  const [duty, setDuty] = useState<DutyUiState>(dutyController.getState());
  const [testOutlets, setTestOutlets] = useState<Outlet[]>([]);
  const [saving, setSaving] = useState(false);
  const [stRunning, setStRunning] = useState(false);
  const [stMsg, setStMsg] = useState('');
  const [stResult, setStResult] = useState<SelfTestCycle[] | null>(null);
  // Voice enrollment can be re-run from here without walking the whole wizard.
  const [veState, setVeState] = useState<'idle' | 'rec' | 'up' | 'ok' | 'fail'>('idle');
  const [veLeft, setVeLeft] = useState(ENROLL_SECONDS);
  const [veMsg, setVeMsg] = useState('');

  const runVE = async () => {
    setVeMsg('');
    setVeLeft(ENROLL_SECONDS);
    setVeState('rec');
    try {
      const res = await runVoiceEnrollment(session, (left) => {
        setVeLeft(left);
        if (left === 0) setVeState('up');
      });
      if (res.ok) {
        setVeState('ok');
        setVeMsg(`saved · ${Math.round((res.sizeBytes ?? 0) / 1024)} KB`);
      } else {
        setVeState('fail');
        setVeMsg(res.error ?? 'unknown');
      }
    } catch (e) {
      setVeState('fail');
      setVeMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const runST = async () => {
    setStRunning(true);
    setStResult(null);
    try {
      const { cycles } = await runSelfTest(session, setStMsg);
      setStResult(cycles);
    } catch (e) {
      Alert.alert('Self-test error', String(e));
    } finally {
      setStRunning(false);
      setStMsg('');
    }
  };

  useEffect(() => dutyController.subscribe(setDuty), []);

  const refreshTest = useCallback(async () => {
    setTestOutlets(await loadTestOutlets());
  }, []);
  useFocusEffect(
    useCallback(() => {
      refreshTest();
    }, [refreshTest]),
  );

  const saveHere = async () => {
    setSaving(true);
    try {
      const o = await dutyController.addTestOutletHere(session.dsr.id);
      if (o) {
        Alert.alert(
          'Test outlet saved',
          `Saved at ${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}.\n\n${
            duty.onDuty
              ? `Now walk ~${WALK_M} m away and back — it will start recording on its own.`
              : `Tap Start Duty, then walk ~${WALK_M} m away and back to trigger it.`
          }`,
        );
      } else {
        Alert.alert('Could not get location', 'Make sure location is on and try again.');
      }
      await refreshTest();
    } catch {
      Alert.alert('Could not get location', 'Make sure location is on and try again.');
    } finally {
      setSaving(false);
    }
  };

  const removeOne = (o: Outlet) => {
    Alert.alert('Delete test outlet?', o.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await dutyController.removeTestOutlet(o.outlet_id);
          await refreshTest();
        },
      },
    ]);
  };

  const liveOutlets = dutyController.getOutlets();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Self-test: records 3× and verifies each reaches the cloud ── */}
      <Text style={styles.sectionLabel}>Self-test (record ×3 → cloud)</Text>
      <Card style={styles.card}>
        <Text style={styles.cardBody}>
          Records 3 short clips back-to-back and checks each one actually reaches the cloud. No
          walking needed. Run it once, then tell me the result.
        </Text>
        <GradientButton
          label={stRunning ? stMsg || 'Running…' : '🧪 Run self-test'}
          onPress={runST}
          busy={stRunning}
        />
        {stResult?.map((c) => (
          <View key={c.cycle} style={styles.stRow}>
            <Text style={styles.stTxt}>
              Recording {c.cycle}:{' '}
              <Text style={{ color: c.recorded ? C.ok : C.rec, fontWeight: '800' }}>
                {c.recorded ? `✓ ${c.sizeKB} KB` : `✗ ${c.note}`}
              </Text>{' '}
              · cloud{' '}
              <Text style={{ color: c.inCloud ? C.ok : C.rec, fontWeight: '800' }}>
                {c.inCloud ? '✓' : '✗'}
              </Text>
            </Text>
          </View>
        ))}
      </Card>

      {/* ── Voice enrollment (re-runnable) ── */}
      <Text style={styles.sectionLabel}>Voice enrollment</Text>
      <Card style={styles.card}>
        <Text style={styles.cardBody}>
          Records {ENROLL_SECONDS}s of you speaking and uploads it as this DSR's
          voiceprint, to sync/voiceprints/{session.dsr.id}/. Re-runnable — the
          newest one wins.
        </Text>
        <GradientButton
          label={
            veState === 'rec'
              ? `Speak now — ${veLeft}s`
              : veState === 'up'
                ? 'Uploading…'
                : veState === 'ok'
                  ? 'Record again'
                  : 'Record voiceprint'
          }
          onPress={runVE}
          busy={veState === 'rec' || veState === 'up'}
        />
        {veMsg !== '' && (
          <Text style={[styles.stTxt, { color: veState === 'ok' ? C.ok : C.rec }]}>
            {veState === 'ok' ? '✓ ' : '✗ '}
            {veMsg}
          </Text>
        )}
      </Card>

      {/* ── Primary: real walk-around test ── */}
      <Text style={styles.sectionLabel}>Walk-around test (real GPS)</Text>
      <Card style={styles.card}>
        <Text style={styles.cardBody}>
          Save wherever you're standing as a dummy shop, then walk ~{WALK_M} m away and back. The
          real geofence will detect you and start recording — a genuine end-to-end test.
        </Text>
        <GradientButton
          label={saving ? 'Getting location…' : '📍 Save my location as a test outlet'}
          onPress={saveHere}
          busy={saving}
        />
      </Card>

      {testOutlets.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Saved test outlets</Text>
          {testOutlets.map((o) => (
            <View key={o.outlet_id} style={styles.outletRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.outletName}>{o.name}</Text>
                <Text style={styles.outletMeta}>
                  {o.lat.toFixed(5)}, {o.lng.toFixed(5)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeOne(o)} hitSlop={10}>
                <Text style={styles.del}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {!duty.onDuty && (
            <Text style={styles.note}>Start Duty to activate these for detection.</Text>
          )}
        </>
      )}

      {/* ── Live state ── */}
      <Text style={styles.sectionLabel}>Live state</Text>
      <Card style={styles.stateCard}>
        <Row k="Duty" v={duty.onDuty ? 'ON' : 'OFF'} />
        <Row k="Geofence state" v={duty.geoPhase} highlight={duty.geoPhase === 'ACTIVE'} />
        <Row
          k="Recording"
          v={duty.recording ? `● ${duty.recordingOutletName}` : 'no'}
          highlight={duty.recording}
        />
        <Row
          k="Nearest outlet"
          v={
            duty.nearestOutletName
              ? `${duty.nearestOutletName} (${duty.nearestDistanceM ?? '?'} m)`
              : '—'
          }
        />
        <Row
          k="Last fix accuracy"
          v={duty.lastAccuracyM != null ? `±${duty.lastAccuracyM} m${duty.signalWeak ? ' — too rough, ignored' : ''}` : '—'}
          highlight={duty.signalWeak}
        />
        <Row k="Fixes processed" v={String(duty.fixCount)} />
      </Card>

      {/* ── Secondary: no-move simulator ── */}
      <Text style={styles.sectionLabel}>No-move simulator</Text>
      <View style={styles.simRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.simTitle}>Desk simulation mode</Text>
          <Text style={styles.simSub}>Ignore real GPS; drive location from the buttons below.</Text>
        </View>
        <Switch
          value={duty.devMode}
          onValueChange={(v) => dutyController.setDevMode(v)}
          trackColor={{ true: C.cobalt }}
          disabled={!duty.onDuty}
        />
      </View>
      {liveOutlets.map((o) => (
        <TouchableOpacity
          key={o.outlet_id}
          style={[styles.outletRow, (!duty.devMode || duty.recording) && styles.rowDisabled]}
          disabled={!duty.devMode || duty.recording}
          onPress={() => dutyController.simulateArriveAt(o)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.outletName}>{o.name}</Text>
            <Text style={styles.outletMeta}>
              {o.outlet_id} · {o.lat.toFixed(4)}, {o.lng.toFixed(4)}
            </Text>
          </View>
          <Text style={styles.arrive}>Arrive ›</Text>
        </TouchableOpacity>
      ))}
      <View style={{ height: 12 }} />
      <GradientButton
        label="Leave current outlet (stop & save visit)"
        variant="stop"
        onPress={() => dutyController.simulateLeave()}
        disabled={!duty.devMode || !duty.recording}
      />
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvK}>{k}</Text>
      <Text style={[styles.kvV, highlight && { color: C.cobalt }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18 },
  sectionLabel: { ...T.label, marginBottom: 10, marginTop: 8 },
  card: { marginBottom: 8, gap: 12 },
  cardBody: { ...T.body, color: C.mid, lineHeight: 21 },
  stRow: { paddingVertical: 2 },
  stTxt: { ...T.body, fontSize: 13.5 },
  stateCard: { marginBottom: 8, gap: 2 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  kvK: { ...T.caption, fontSize: 13 },
  kvV: { ...T.body, fontWeight: '700', fontSize: 14 },
  outletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    padding: 15,
    marginBottom: 10,
    ...SHADOW.card,
  },
  rowDisabled: { opacity: 0.4 },
  outletName: { ...T.h2, fontSize: 15 },
  outletMeta: { ...T.caption, marginTop: 2, fontSize: 11 },
  del: { color: C.rec, fontSize: 18, fontWeight: '800', paddingHorizontal: 6 },
  arrive: { color: C.cobalt, fontWeight: '800', fontSize: 14 },
  note: { ...T.caption, marginBottom: 8 },
  simRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    padding: 15,
    marginBottom: 12,
    ...SHADOW.card,
  },
  simTitle: { ...T.h2, fontSize: 15 },
  simSub: { ...T.caption, marginTop: 2 },
});
