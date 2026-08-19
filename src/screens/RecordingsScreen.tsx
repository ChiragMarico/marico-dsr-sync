import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useFocusEffect } from '@react-navigation/native';
import { Props } from '../navigation';
import { presignFullKey } from '../upload/s3Presign';
import { listObjects, S3Object } from '../upload/s3List';
import { C, R, SHADOW, T } from '../ui/theme';
import { Card } from '../ui/components';
import { useT } from '../i18n';

/** Parse a recordings key into friendly labels. */
function label(key: string): { title: string; sub: string } {
  // marico-dsr/recordings/{dsr}/{date}/{outlet}/{visit}/chunk_001.m4a
  const parts = key.split('/');
  const file = parts[parts.length - 1];
  const outlet = parts[parts.length - 3] ?? '';
  const date = parts[parts.length - 4] ?? '';
  return { title: `${outlet} · ${file}`, sub: date };
}

function sizeKB(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function RecordingsScreen(_props: Props<'Recordings'>) {
  const { t } = useT();
  const [items, setItems] = useState<S3Object[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    const p = createAudioPlayer();
    playerRef.current = p;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    const sub = p.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        setPlayingKey(null);
        setPaused(false);
      }
    });
    return () => {
      try {
        sub.remove();
        p.remove();
      } catch {
        /* noop */
      }
    };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const all = await listObjects('recordings/');
      setItems(all.filter((o) => o.key.toLowerCase().endsWith('.m4a')));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('recLoadFail'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const play = (item: S3Object) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (playingKey === item.key) {
        // Same track → toggle pause / resume.
        if (paused) {
          p.play();
          setPaused(false);
        } else {
          p.pause();
          setPaused(true);
        }
        return;
      }
      p.replace({ uri: presignFullKey(item.key) });
      p.play();
      setPlayingKey(item.key);
      setPaused(false);
    } catch {
      setError(t('recPlayFail'));
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.cobalt} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(o) => o.key}
        contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.cobalt} />}
        ListHeaderComponent={
          items.length > 0 ? (
            <View style={styles.headerRow}>
              <Text style={styles.head}>{t('recCountHeader', { n: items.length })}</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.empty}>{error ?? t('recEmpty')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const { title, sub } = label(item.key);
          const isActive = playingKey === item.key;
          const isPlayingNow = isActive && !paused;
          return (
            <Card style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.sub}>
                  {sub} · {sizeKB(item.size)}
                </Text>
              </View>
              <TouchableOpacity style={[styles.play, isPlayingNow && styles.playing]} onPress={() => play(item)}>
                <Text style={[styles.playTxt, isPlayingNow && { color: '#fff' }]}>
                  {isPlayingNow ? `❚❚ ${t('recPause')}` : isActive ? `▶ ${t('recResume')}` : `▶ ${t('recPlay')}`}
                </Text>
              </TouchableOpacity>
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', backgroundColor: C.bg },
  list: { padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  head: { ...T.label },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  title: { ...T.h2, fontSize: 14 },
  sub: { ...T.caption, marginTop: 2 },
  play: {
    borderRadius: R.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.cobalt,
    ...SHADOW.card,
  },
  playing: { backgroundColor: C.cobalt },
  playTxt: { color: C.cobalt, fontWeight: '800', fontSize: 13 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  empty: { ...T.body, color: C.low, textAlign: 'center', lineHeight: 22 },
});
