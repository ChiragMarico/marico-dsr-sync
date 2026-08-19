import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useFocusEffect } from '@react-navigation/native';
import { Props } from '../navigation';
import { presignFullKey } from '../upload/s3Presign';
import { listObjects } from '../upload/s3List';
import { C, R, SHADOW, T } from '../ui/theme';
import { Card } from '../ui/components';
import { useT } from '../i18n';

/**
 * Admin view of enrolled voiceprints — who has recorded a voice sample, when,
 * and how big it is (size is a rough proxy for "did they actually speak").
 * Lets an admin play a sample back to confirm it is usable before the pipeline
 * ever runs, rather than discovering silent enrollments months later.
 */
interface Row {
  dsrId: string;
  key: string;
  sizeKB: number;
  when: string;
}

export default function VoiceprintsScreen(_props: Props<'Voiceprints'>) {
  const { t } = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [player, setPlayer] = useState<AudioPlayer | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await listObjects('');
      // Keys look like: sync/voiceprints/{dsr_id}/enrollment_{ts}.m4a
      const found = all
        .filter((o) => o.key.includes('voiceprints/') && o.key.endsWith('.m4a'))
        .map((o) => {
          const parts = o.key.split('/');
          const idx = parts.indexOf('voiceprints');
          return {
            dsrId: idx >= 0 ? (parts[idx + 1] ?? '?') : '?',
            key: o.key,
            sizeKB: Math.max(1, Math.round(o.size / 1024)),
            when: (o.lastModified || '').slice(0, 16).replace('T', ' '),
          };
        });
      // Newest per DSR first; keep every sample so re-enrolments are visible.
      found.sort((a, b) => b.when.localeCompare(a.when));
      setRows(found);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
      return () => {
        try {
          player?.remove();
        } catch {
          /* noop */
        }
      };
    }, [load]),
  );

  const play = async (row: Row) => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      let p = player;
      if (!p) {
        p = createAudioPlayer();
        setPlayer(p);
      }
      p.replace({ uri: presignFullKey(row.key) });
      p.play();
      setPlaying(row.key);
    } catch {
      setPlaying(null);
    }
  };

  const distinct = new Set(rows.map((r) => r.dsrId)).size;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.cobalt} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Card style={styles.summary}>
        <Text style={styles.summaryTxt}>{t('vpEnrolled', { n: distinct })}</Text>
      </Card>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={rows.length ? styles.list : styles.emptyWrap}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={load} tintColor={C.cobalt} />
        }
        ListEmptyComponent={<Text style={styles.empty}>{t('vpNone')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dsr}>{item.dsrId}</Text>
              <Text style={styles.meta}>
                {t('vpRecorded', { d: item.when })} · {item.sizeKB} KB
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.play, playing === item.key && styles.playing]}
              onPress={() => play(item)}
            >
              <Text style={[styles.playTxt, playing === item.key && { color: '#fff' }]}>
                {playing === item.key ? '❚❚' : '▶'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', backgroundColor: C.bg },
  summary: { margin: 16, padding: 16 },
  summaryTxt: { ...T.h2, fontSize: 17 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 10,
    ...SHADOW.card,
  },
  dsr: { ...T.h2, fontSize: 16 },
  meta: { ...T.caption, marginTop: 3, fontSize: 12.5 },
  play: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
    borderWidth: 1.5,
    borderColor: C.cobalt,
  },
  playing: { backgroundColor: C.cobalt },
  playTxt: { color: C.cobalt, fontSize: 16, fontWeight: '800' },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  empty: { ...T.body, color: C.low, textAlign: 'center', lineHeight: 23 },
});
