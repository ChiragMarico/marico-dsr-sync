/**
 * Persisted duty flag so the watchdog (PRD §7.3) can detect an OEM-killed
 * service: if this says "on duty" but the location task isn't registered on
 * next app open, we know the phone interrupted the session.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'duty_state_v1';

export interface PersistedDutyState {
  onDuty: boolean;
  dsrId: string;
  startedAt: string; // ISO
  date: string; // YYYY-MM-DD (local) the duty belongs to
}

export async function saveDutyState(s: PersistedDutyState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function loadDutyState(): Promise<PersistedDutyState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PersistedDutyState) : null;
  } catch {
    return null;
  }
}

export async function clearDutyState(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
