import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LANGS, useT } from '../i18n';
import { C, R, SHADOW, T } from './theme';

/**
 * Language dropdown: a trigger showing the current language (in its own script)
 * that opens a scrollable sheet of all languages. A list scales to any number
 * of future languages, unlike the old chip row. `size="lg"` = onboarding.
 */
export function LanguagePicker({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const { t, lang, setLang } = useT();
  const [open, setOpen] = useState(false);
  const lg = size === 'lg';
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, lg && styles.triggerLg]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.globe}>🌐</Text>
        <Text style={[styles.triggerTxt, lg && styles.triggerTxtLg]}>{current.label}</Text>
        <Text style={styles.chev}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t('chooseLanguage')}</Text>
            <ScrollView style={styles.list} bounces={false}>
              {LANGS.map((l) => {
                const active = l.code === lang;
                return (
                  <TouchableOpacity
                    key={l.code}
                    style={[styles.row, active && styles.rowActive]}
                    activeOpacity={0.85}
                    onPress={async () => {
                      await setLang(l.code);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.rowTxt, active && styles.rowTxtActive]}>{l.label}</Text>
                    {active && <Text style={styles.check}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: R.pill,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.surface,
    ...SHADOW.card,
  },
  triggerLg: { paddingHorizontal: 24, paddingVertical: 15 },
  globe: { fontSize: 15 },
  triggerTxt: { fontSize: 15, fontWeight: '700', color: C.ink },
  triggerTxtLg: { fontSize: 19 },
  chev: { fontSize: 14, color: C.low, fontWeight: '700' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,16,32,0.45)',
    justifyContent: 'center',
    padding: 28,
  },
  sheet: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 18,
    maxHeight: '70%',
    ...SHADOW.raised,
  },
  sheetTitle: { ...T.h2, fontSize: 17, marginBottom: 10, textAlign: 'center' },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: R.md,
    marginBottom: 4,
  },
  rowActive: { backgroundColor: 'rgba(28,90,168,0.08)' },
  rowTxt: { fontSize: 17, fontWeight: '600', color: C.ink },
  rowTxtActive: { color: C.cobalt, fontWeight: '800' },
  check: { color: C.cobalt, fontSize: 17, fontWeight: '800' },
});
