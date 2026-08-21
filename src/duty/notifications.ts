/**
 * Notification helpers. The mandatory persistent foreground-service
 * notification ("ON DUTY — tracking visits") is owned by expo-location's
 * foregroundService config (see locationTask.ts). This module adds the
 * supplementary "🔴 RECORDING at {outlet}" ongoing notification and one-off
 * alerts (location revoked, duty interrupted), all bilingual per PRD §10.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { COLORS } from '../constants';

export const DUTY_CHANNEL = 'duty';
export const ALERT_CHANNEL = 'alerts';
/**
 * Separate channel for microphone failures so it can vibrate and make sound
 * even though the duty channel is deliberately silent. A rep works with the
 * phone in a pocket — an on-screen banner reaches nobody, so this has to be
 * something they physically feel.
 */

let recordingNotifId: string | null = null;

export async function setupNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(DUTY_CHANNEL, {
      name: 'Duty status',
      importance: Notifications.AndroidImportance.LOW, // quiet, persistent
      showBadge: false,
    });
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
      name: 'Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      showBadge: false,
    });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
  if (granted) return true;
  if (!canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

/** Show/refresh the ongoing recording notification. */
export async function showRecordingNotification(outletName: string): Promise<void> {
  await clearRecordingNotification();
  recordingNotifId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔴 Recording',
      body: outletName,
      color: COLORS.recording,
      sticky: true,
      autoDismiss: false,
      priority: 'high',
    },
    trigger: null, // present immediately
  });
}

export async function clearRecordingNotification(): Promise<void> {
  if (recordingNotifId) {
    await Notifications.dismissNotificationAsync(recordingNotifId).catch(() => {});
    recordingNotifId = null;
  }
}

/**
 * The microphone is recording silence. Fires a loud, vibrating, heads-up
 * notification because the rep is not looking at the screen — this is the only
 * way they learn the visit is being lost while they can still do something.
 */

/** One-off high-priority alert (location revoked, duty interrupted, etc.). */
export async function alert(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, priority: 'max' },
    trigger: null,
  });
}
