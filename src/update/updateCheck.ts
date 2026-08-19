/**
 * In-app version gate.
 *
 * Over-the-air updates cover JS changes, but a NATIVE change (new permission,
 * new native module, icon/name) needs a fresh APK install — and a rep will
 * otherwise keep running an old build indefinitely without ever knowing.
 *
 * So we publish a small file to S3 describing the current fleet:
 *
 *   sync/config/app-version.json
 *   {
 *     "latest_version":        "1.2.0",   // newest APK available
 *     "min_supported_version": "1.1.0",   // below this the app is BLOCKED
 *     "apk_url":               "https://...",
 *     "notes":                 "adds Bengali"
 *   }
 *
 * Comparing against APP_VERSION is sound because `runtimeVersion` uses the
 * `appVersion` policy: an OTA is only ever served to an APK of the same
 * version, so the bundled APP_VERSION always equals the installed APK version.
 *
 * SAFETY: every failure path returns "up to date". A network blip, a malformed
 * file or a missing key must never brick 2,392 phones — this gate can only ever
 * block when it has positively read a config that says to.
 */
import { APP_VERSION } from '../constants';
import { presignFullKey } from '../upload/s3Presign';

const VERSION_KEY = 'sync/config/app-version.json';

export interface AppVersionInfo {
  latest_version: string;
  min_supported_version: string;
  apk_url?: string;
  apk_key?: string;
  notes?: string;
}

export interface UpdateStatus {
  updateAvailable: boolean;
  /** True only when the installed build is below min_supported_version. */
  forceUpdate: boolean;
  latest: string | null;
  apkUrl: string | null;
  notes: string | null;
}

const UP_TO_DATE: UpdateStatus = {
  updateAvailable: false,
  forceUpdate: false,
  latest: null,
  apkUrl: null,
  notes: null,
};

/** Compare dotted numeric versions: >0 if a>b, <0 if a<b, 0 if equal. */
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
  try {
    const res = await fetch(presignFullKey(VERSION_KEY));
    if (!res.ok) return UP_TO_DATE; // includes 404 — no config published yet
    const info = (await res.json()) as AppVersionInfo;
    if (!info?.latest_version || !info?.min_supported_version) return UP_TO_DATE;
    return {
      updateAvailable: compareVersions(info.latest_version, APP_VERSION) > 0,
      forceUpdate: compareVersions(info.min_supported_version, APP_VERSION) > 0,
      latest: info.latest_version,
      apkUrl: info.apk_url ?? null,
      notes: info.notes ?? null,
    };
  } catch {
    return UP_TO_DATE; // never block the app on a failed check
  }
}
