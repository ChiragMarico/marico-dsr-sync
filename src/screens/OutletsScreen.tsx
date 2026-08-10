import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { dutyController, DutyUiState } from '../duty/dutyController';
import { syncOutlets } from '../storage/outletCache';
import { haversineMeters } from '../geofence/haversine';
import { DAY_KEYS, DayKey, Outlet, outletHasDays, Session, todayKey } from '../types';
import { Props } from '../navigation';
import { C, R, SHADOW, T } from '../ui/theme';
import { Pill } from '../ui/components';
import { StringKey } from '../i18n/strings';
import { useT } from '../i18n';

interface Extra {
  session: Session;
}

// day key → short-label i18n key
const DAY_LABEL: Record<DayKey, StringKey> = {
  monday: 'dayMon',
  tuesday: 'dayTue',
  wednesday: 'dayWed',
  thursday: 'dayThu',
  friday: 'dayFri',
  saturday: 'daySat',
  sunday: 'daySun',
};

function fmtDist(m: number | null): string {
  if (m == null) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m} m`;
}

export default function OutletsScreen({ session }: Props<'Outlets'> & Extra) {
  const { t } = useT();
  const [duty, setDuty] = useState<DutyUiState>(dutyController.getState());
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Which beat day is shown. 'today' resolves to the live weekday.
  const [sel, setSel] = useState<'today' | DayKey>('today');
  const today = todayKey();
  const activeDay: DayKey = sel === 'today' ? today : sel;

  useEffect(() => dutyController.subscribe(setDuty), []);

  const load = useCallback(async () => {
    try {
      // Only trust the controller's in-memory list while ON DUTY (it's the live
      // merged list incl. test outlets). Off duty → always fetch fresh for THIS
      // DSR, so a previous login's outlets can never be shown.
      const live = dutyController.isOnDuty() ? dutyController.getOutlets() : [];
      if (live.length) {
        setOutlets(live);
      } else {
        const r = await syncOutlets(session.dsr.id, session.token);
        setOutlets(r.outlets);
      }
    } catch {
      /* keep whatever we had */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visited = useMemo(() => new Set(duty.visitedOutletIds), [duty.visitedOutletIds]);
  const lf = duty.lastFix;

  // Does any outlet carry beat-day flags? (Old data / only test outlets → no.)
  const hasDayData = useMemo(() => outlets.some(outletHasDays), [outlets]);

  // Filter to the selected day. Outlets without day flags (test outlets) always
  // show. If the DSR's data has no day flags at all, show everything.
  const dayOutlets = useMemo(() => {
    if (!hasDayData) return outlets;
    return outlets.filter((o) => !outletHasDays(o) || o[activeDay] === true);
  }, [outlets, activeDay, hasDayData]);

  const rows = useMemo(() => {
    return dayOutlets
      .map((o) => ({
        o,
        distM: lf ? Math.round(haversineMeters(lf.lat, lf.lng, o.lat, o.lng)) : null,
        visited: visited.has(o.outlet_id),
      }))
      .sort((a, b) => {
        if (a.distM == null && b.distM == null) return 0;
        if (a.distM == null) return 1;
        if (b.distM == null) return -1;
        return a.distM - b.distM;
      });
  }, [dayOutlets, lf, visited]);

  const visitedCount = rows.filter((r) => r.visited).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.cobalt} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {hasDayData && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayBar}
          contentContainerStyle={styles.dayBarContent}
        >
          <DayChip
            label={t('today')}
            active={sel === 'today'}
            onPress={() => setSel('today')}
          />
          {DAY_KEYS.map((d) => (
            <DayChip
              key={d}
              label={t(DAY_LABEL[d])}
              isToday={d === today}
              active={sel !== 'today' && sel === d}
              onPress={() => setSel(d)}
            />
          ))}
        </ScrollView>
      )}

      <View style={[styles.kpiRow, !hasDayData && styles.kpiRowTop]}>
        <Kpi n={dayOutlets.length} label={t('kpiTotal')} color={C.cobalt} />
        <Kpi n={visitedCount} label={t('visited')} color={C.ok} />
        <Kpi n={dayOutlets.length - visitedCount} label={t('pending')} color={C.waitText} />
      </View>
      {!duty.onDuty && <Text style={styles.hint}>{t('startDayForDistances')}</Text>}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.o.outlet_id}
        contentContainerStyle={styles.list}
        initialNumToRender={15}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={C.cobalt}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {hasDayData ? t('noOutletsForDay') : t('noOutletsAssigned')}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: item.visited ? C.ok : C.amber }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.o.name}
              </Text>
              <Text style={styles.meta}>{item.o.outlet_id}</Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.dist}>{fmtDist(item.distM)}</Text>
              <Pill tone={item.visited ? 'ok' : 'wait'} label={item.visited ? t('visited') : t('pending')} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

function Kpi({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={[styles.kpiNum, { color }]}>{n}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function DayChip({
  label,
  active,
  isToday,
  onPress,
}: {
  label: string;
  active: boolean;
  isToday?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{label}</Text>
      {isToday && <View style={[styles.chipDot, active && styles.chipDotActive]} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', backgroundColor: C.bg },
  dayBar: { marginTop: 50, flexGrow: 0, flexShrink: 0 },
  dayBarContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 16,
    minHeight: 40,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.surface,
  },
  chipActive: { backgroundColor: C.cobalt, borderColor: C.cobalt },
  chipTxt: { fontSize: 15, fontWeight: '700', color: C.mid },
  chipTxtActive: { color: '#fff' },
  chipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.cobalt },
  chipDotActive: { backgroundColor: '#fff' },
  kpiRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginHorizontal: 16, marginBottom: 4 },
  kpiRowTop: { marginTop: 52 },
  kpiCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 15,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    ...SHADOW.card,
  },
  kpiNum: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  kpiLabel: { ...T.caption, fontSize: 13.5, marginTop: 3 },
  hint: { ...T.caption, fontSize: 13, marginTop: 8, marginHorizontal: 18 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 9,
    ...SHADOW.card,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  name: { ...T.h2, fontSize: 15 },
  meta: { ...T.caption, marginTop: 1, fontSize: 11 },
  right: { alignItems: 'flex-end', gap: 5 },
  dist: { ...T.body, fontWeight: '800', fontSize: 14, color: C.cobalt, fontVariant: ['tabular-nums'] },
  empty: { ...T.body, color: C.low, textAlign: 'center', marginTop: 40 },
});
