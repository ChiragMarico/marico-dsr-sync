/**
 * Download and install a new APK from inside the app.
 *
 * Why this exists
 * ---------------
 * Native changes cannot ship over the air, and the old flow — open the APK URL
 * in a browser, find it in Downloads, tap it, grant Chrome permission to
 * install unknown apps — is more than we can ask of every rep, every time.
 * Chasing installs is what actually limits how fast we can fix things.
 *
 * With `REQUEST_INSTALL_PACKAGES` declared, the app fetches the APK itself and
 * hands it straight to Android's package installer. The rep taps "Update", then
 * "Install". Nothing else. This is the last reinstall anyone has to be talked
 * through — every later one runs through here.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

/** MIME type Android's package installer responds to. */
const APK_MIME = 'application/vnd.android.package-archive';

// Intent.FLAG_GRANT_READ_URI_PERMISSION — without it the installer cannot read
// the content:// URI we hand it. FLAG_ACTIVITY_NEW_TASK is required because we
// are starting the activity from outside an Activity context.
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;

function apkDir(): Directory {
  const dir = new Directory(Paths.cache, 'updates');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Send the rep to the one Android settings page that lets this app install
 * updates. Only needed once per device; after that installs are a single tap.
 */
export async function openInstallPermissionSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const pkg = Constants.expoConfig?.android?.package;
  await IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
    pkg ? { data: `package:${pkg}` } : {},
  );
}

export interface InstallResult {
  ok: boolean;
  /** Set when we could not hand the file to the installer. */
  error?: string;
}

/**
 * Fetch `url` and open Android's installer on it.
 *
 * Falls back to opening the URL in a browser if anything here fails, so a rep
 * is never left with no route forward — the old manual path still works.
 */
export async function downloadAndInstallApk(url: string): Promise<InstallResult> {
  if (Platform.OS !== 'android') return { ok: false, error: 'android only' };

  try {
    const dir = apkDir();
    // Re-downloading is cheaper than reasoning about a half-written file from
    // an interrupted attempt, and the cache dir is wiped by Android anyway.
    for (const f of dir.list()) {
      try {
        f.delete();
      } catch {
        /* leftover from a previous attempt; the installer ignores it */
      }
    }

    const file = await File.downloadFileAsync(url, dir);
    const contentUri = await getContentUriAsync(file.uri);

    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: APK_MIME,
      flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
    });
    return { ok: true };
  } catch (e) {
    // Most likely cause is the "install unknown apps" grant being absent, which
    // the rep can fix in one screen — but fall back to the browser regardless.
    try {
      await Linking.openURL(url);
    } catch {
      /* nothing left to try */
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
