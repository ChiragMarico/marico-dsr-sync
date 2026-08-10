/**
 * Persisted "test outlets" — dummy outlets a developer saves at their current
 * location to exercise the real geofence by walking in/out. Kept separate from
 * the synced outlet list and merged in at Start Duty. Dev/testing only.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Outlet } from '../types';

const KEY = 'test_outlets_v1';

export async function loadTestOutlets(): Promise<Outlet[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Outlet[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function addTestOutlet(o: Outlet): Promise<void> {
  const list = await loadTestOutlets();
  list.push(o);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function removeTestOutletStored(id: string): Promise<void> {
  const list = (await loadTestOutlets()).filter((o) => o.outlet_id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}
