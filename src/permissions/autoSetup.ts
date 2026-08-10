/**
 * "Let the app do it for them."
 *
 * Honest reality of Android: no app can *silently* flip another app's
 * permissions, battery whitelist, or OEM autostart — the OS forbids it. What we
 * CAN do is fire the exact system dialog with one tap, so the DSR just sees
 * "Allow" and taps it, instead of hunting through Settings menus.
 *
 * - Battery: fires the system "let this app ignore battery optimisation?" dialog
 *   directly (one tap = Allow). This is the closest thing to doing it for them.
 * - Autostart (Xiaomi/Oppo/Vivo/etc.): there is NO API to toggle it. Best we can
 *   do is deep-link straight to that OEM's autostart screen so it's one tap away.
 */
import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

const PKG = 'com.marico.dsrpilot';

/**
 * Open THIS app's system settings page. On Android 11+ this is the only place
 * the user can set location to "Allow all the time" (the OS won't show a dialog
 * for it). They tap Permissions → Location → Allow all the time.
 */
export async function openAppLocationSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.APPLICATION_DETAILS_SETTINGS',
      { data: `package:${PKG}` },
    );
    return true;
  } catch {
    return false;
  }
}

/** Fire the system battery-optimisation exemption dialog (one-tap Allow). */
export async function requestBatteryExemption(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      { data: `package:${PKG}` },
    );
    return true;
  } catch {
    // Fallback: the full battery-optimisation list (user picks the app).
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
      );
      return true;
    } catch {
      return false;
    }
  }
}

// Known OEM autostart screens. We try each; the first that exists opens.
const AUTOSTART_TARGETS: { packageName: string; className: string }[] = [
  // Xiaomi / MIUI
  { packageName: 'com.miui.securitycenter', className: 'com.miui.permcenter.autostart.AutoStartManagementActivity' },
  // Oppo / ColorOS
  { packageName: 'com.coloros.safecenter', className: 'com.coloros.safecenter.permission.startup.StartupAppListActivity' },
  { packageName: 'com.oppo.safe', className: 'com.oppo.safe.permission.startup.StartupAppListActivity' },
  // Vivo / Funtouch
  { packageName: 'com.vivo.permissionmanager', className: 'com.vivo.permissionmanager.activity.BgStartUpManagerActivity' },
  { packageName: 'com.iqoo.secure', className: 'com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity' },
  // Realme
  { packageName: 'com.coloros.safecenter', className: 'com.coloros.safecenter.startupapp.StartupAppListActivity' },
  // Huawei
  { packageName: 'com.huawei.systemmanager', className: 'com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity' },
];

/** Deep-link to the OEM autostart screen if we can find it; else app details. */
export async function openAutostart(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  for (const t of AUTOSTART_TARGETS) {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
        packageName: t.packageName,
        className: t.className,
      });
      return true;
    } catch {
      /* try the next OEM target */
    }
  }
  // No OEM autostart screen matched — open this app's details page as a fallback.
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.APPLICATION_DETAILS_SETTINGS',
      { data: `package:${PKG}` },
    );
    return true;
  } catch {
    return false;
  }
}
