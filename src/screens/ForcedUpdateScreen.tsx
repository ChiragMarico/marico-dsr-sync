import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { APP_VERSION } from '../constants';
import { UpdateStatus } from '../update/updateCheck';
import { C, R, SHADOW, T } from '../ui/theme';
import { GradientButton } from '../ui/components';
import { useT } from '../i18n';
import { downloadAndInstallApk, openInstallPermissionSettings } from '../update/selfInstall';

/**
 * Blocking screen shown when the installed APK is older than
 * `min_supported_version`. Over-the-air updates cannot fix a native change, so
 * the rep genuinely has to install a new APK — and left to themselves they
 * would keep running the old build for months without knowing.
 *
 * Deliberately has no dismiss action: this only ever renders when the server
 * has positively said the build is unsupported (every failure path in
 * checkForUpdate() reports "up to date"), so there is nothing to escape to.
 */
export function ForcedUpdateScreen({ status }: { status: UpdateStatus }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  // Shown only after an install attempt fails, which in practice means Android
  // has not been told this app may install updates. Leading with it would be
  // one more step for the reps who don't need it.
  const [needsPermission, setNeedsPermission] = useState(false);

  const install = async () => {
    if (!status.apkUrl || busy) return;
    setBusy(true);
    const res = await downloadAndInstallApk(status.apkUrl);
    setNeedsPermission(!res.ok);
    setBusy(false);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>⬇️</Text>
      </View>

      <Text style={styles.title}>{t('fuTitle')}</Text>
      <Text style={styles.body}>{t('fuBody')}</Text>

      <View style={styles.versions}>
        <Text style={styles.vRow}>{t('fuYourVersion', { v: APP_VERSION })}</Text>
        <Text style={[styles.vRow, styles.vNeeded]}>
          {t('fuNeeded', { v: status.latest ?? '—' })}
        </Text>
      </View>

      {status.apkUrl ? (
        <GradientButton
          label={busy ? t('fuDownloading') : t('fuDownload')}
          onPress={install}
          disabled={busy}
        />
      ) : null}

      {needsPermission ? (
        <View style={styles.permWrap}>
          <Text style={styles.permText}>{t('fuAllowInstallBody')}</Text>
          <GradientButton
            label={t('fuAllowInstall')}
            onPress={() => void openInstallPermissionSettings()}
          />
        </View>
      ) : null}

      <Text style={styles.help}>{t('fuHelp')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 26, paddingTop: 90, alignItems: 'center' },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(28,90,168,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  icon: { fontSize: 46 },
  title: { ...T.display, fontSize: 26, textAlign: 'center', marginBottom: 14 },
  body: { ...T.body, fontSize: 17, color: C.mid, textAlign: 'center', lineHeight: 25, marginBottom: 26 },
  versions: {
    alignSelf: 'stretch',
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    marginBottom: 26,
    gap: 6,
    ...SHADOW.card,
  },
  vRow: { ...T.body, fontSize: 15, textAlign: 'center', color: C.mid },
  vNeeded: { color: C.cobalt, fontWeight: '800' },
  permWrap: { alignSelf: 'stretch', marginTop: 18, gap: 12 },
  permText: { ...T.body, fontSize: 15, color: C.mid, textAlign: 'center', lineHeight: 22 },
  help: { ...T.caption, fontSize: 14, textAlign: 'center', marginTop: 20, lineHeight: 21 },
});
