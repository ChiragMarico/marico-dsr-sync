/**
 * Outlet sync + cache (PRD §7.2).
 * - syncOutlets(): fetch fresh via Lambda, cache on success.
 * - Fetch fails but cache exists → return cache with fromCache flag (caller
 *   shows "Using saved outlet list" toast).
 * - Fetch fails, no cache → throws the fetch error (caller blocks Start Duty).
 * - Malformed response → treated as fetch failure, old cache kept.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiConfig } from '../api/client';
import { Outlet } from '../types';

const KEY = 'outlet_cache_v1';

interface CacheEntry {
  dsr_id: string;
  outlets: Outlet[];
  version: string;
  synced_at: string;
}

export interface OutletSyncResult {
  outlets: Outlet[];
  fromCache: boolean;
  syncedAt: string;
}

function isValidOutlet(o: unknown): o is Outlet {
  const x = o as Outlet;
  return (
    !!x &&
    typeof x.outlet_id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.lat === 'number' &&
    typeof x.lng === 'number' &&
    typeof x.dsr_id === 'string'
  );
}

export async function loadCachedOutlets(dsrId: string): Promise<CacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.dsr_id !== dsrId || !Array.isArray(entry.outlets)) return null;
    return entry;
  } catch {
    return null;
  }
}

export async function syncOutlets(dsrId: string, token: string): Promise<OutletSyncResult> {
  try {
    const res = await apiConfig(dsrId, token);
    if (!Array.isArray(res.outlets) || !res.outlets.every(isValidOutlet)) {
      throw new Error('malformed outlets payload');
    }
    const entry: CacheEntry = {
      dsr_id: dsrId,
      outlets: res.outlets,
      version: res.version,
      synced_at: new Date().toISOString(),
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(entry));
    return { outlets: res.outlets, fromCache: false, syncedAt: entry.synced_at };
  } catch (err) {
    const cached = await loadCachedOutlets(dsrId);
    if (cached) {
      return { outlets: cached.outlets, fromCache: true, syncedAt: cached.synced_at };
    }
    throw err;
  }
}

export async function clearOutletCache(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
