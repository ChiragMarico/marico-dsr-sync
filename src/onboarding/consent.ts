import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'consent_ts';
const ONBOARDED_KEY = 'onboarded_v1';

export async function saveConsent(): Promise<void> {
  await AsyncStorage.setItem(CONSENT_KEY, new Date().toISOString());
}
export async function hasConsent(): Promise<boolean> {
  return (await AsyncStorage.getItem(CONSENT_KEY)) != null;
}
export async function markOnboarded(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDED_KEY, '1');
}
export async function isOnboarded(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDED_KEY)) === '1';
}
