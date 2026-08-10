import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Props } from '../navigation';
import { Session } from '../types';
import { pendingVisitIds, todayVisits, VisitRow } from '../data/visitsRepo';
import { C, R, SHADOW, T } from '../ui/theme';
import { Pill } from '../ui/components';
import { useT } from '../i18n';

interface Extra {
  session: Session;
}

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function VisitHistoryScreen({ session }: Props<'VisitHistory'> & Extra) {
  const { t } = useT();
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [v, p] = await Promise.all([todayVisits(session.dsr.id, localDate()), pendingVisitIds()]);
    setVisits(v);
    setPending(p);
    setRefreshing(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const uploaded = visits.filter((v) => !pending.has(v.visit_id)).length;

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {t('today')}: <Text style={styles.strong}>{t('vhVisitsN', { v: visits.length })}</Text> ·{' '}
          {t('vhUploadedN', { u: uploaded })} · {t('vhPendingN', { p: visits.length - uploaded })}
        </Text>
      </View>
      <FlatList
        data={visits}
        keyExtractor={(v) => v.visit_id}
        contentContainerStyle={visits.length === 0 ? styles.emptyWrap : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.cobalt} />}
        ListEmptyComponent={<Text style={styles.empty}>{t('vhEmpty')}</Text>}
        renderItem={({ item }) => {
          const isPending = pending.has(item.visit_id);
          return (
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: isPending ? C.amber : C.ok }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.outlet}>{item.outlet_name}</Text>
                <Text style={styles.meta}>
                  {hm(item.enter_ts)}
                  {item.exit_ts ? ` – ${hm(item.exit_ts)}` : ` · ${t('recOngoing')}`}
                  {item.trigger === 'manual' ? ` · ${t('recManual')}` : ''}
                </Text>
              </View>
              <Pill tone={isPending ? 'wait' : 'ok'} label={isPending ? t('pending') : t('uploaded')} />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  summary: { margin: 16, padding: 14, backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, ...SHADOW.card },
  summaryText: { ...T.body, color: C.mid, fontWeight: '600' },
  strong: { color: C.ink, fontWeight: '800' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 15,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 10,
    ...SHADOW.card,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  outlet: { ...T.h2, fontSize: 15 },
  meta: { ...T.caption, marginTop: 2 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { ...T.body, color: C.low },
});
