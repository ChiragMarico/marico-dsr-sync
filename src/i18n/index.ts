import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { translations, Lang } from './translations';
import { StringKey } from './strings';

const KEY = 'app_lang_v1';

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'mr', label: 'मराठी' },
  { code: 'te', label: 'తెలుగు' },
];

let current: Lang = 'en';
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

/** Load saved language, else fall back to the device language, else English. */
export async function initLang(): Promise<void> {
  try {
    const saved = (await AsyncStorage.getItem(KEY)) as Lang | null;
    if (saved && translations[saved]) {
      current = saved;
      return;
    }
    const dev = getLocales()?.[0]?.languageCode as Lang | undefined;
    if (dev && translations[dev]) current = dev;
  } catch {
    /* default en */
  }
}

export async function setLang(lang: Lang): Promise<void> {
  current = lang;
  try {
    await AsyncStorage.setItem(KEY, lang);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function subscribeLang(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function t(key: StringKey, params?: Record<string, string | number>): string {
  const dict = translations[current] as Record<string, string>;
  let s = dict[key] ?? (translations.en as Record<string, string>)[key] ?? String(key);
  if (params) for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]));
  return s;
}

/** Hook: gives t() and re-renders the component when the language changes. */
export function useT() {
  const [, force] = useState(0);
  useEffect(() => subscribeLang(() => force((n) => n + 1)), []);
  return { t, lang: current, setLang };
}
