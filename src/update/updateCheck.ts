/**
 * In-app update check (PRD §7.8). Reads config/app-version.json from S3 and
 * compares against the installed version. Non-blocking banner if a newer
 * version exists; blocking screen if below min_supported_version.
 */
import { API_MODE, APP_VERSION, APP_VERSION_URL } from '../constants';

export interface AppVersionInfo {
  latest_version: string;
  min_supported_version: string;
  apk_key: string;
}

export interface UpdateStatus {
  updateAvailable: boolean;
  forceUpdate: boolean;
  latest: string | null;
  apkKey: string | null;
}

const UP_TO_DATE: UpdateStatus = {
  updateAvailable: false,
  forceUpdate: false,
  latest: null,
  apkKey: null,
};

/** Compare dotted numeric versions: returns >0 if a>b, <0 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  // Mock mode has no S3 to read — report up to date.
  if (API_MODE === 'mock') return UP_TO_DATE;
  try {
    const res = await fetch(APP_VERSION_URL, { method: 'GET' });
    if (!res.ok) return UP_TO_DATE;
    const info = (await res.json()) as AppVersionInfo;
    return {
      updateAvailable: compareVersions(info.latest_version, APP_VERSION) > 0,
      forceUpdate: compareVersions(info.min_supported_version, APP_VERSION) > 0,
      latest: info.latest_version,
      apkKey: info.apk_key,
    };
  } catch {
    return UP_TO_DATE; // never block the app on a failed update check
  }
}
