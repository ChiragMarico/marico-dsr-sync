/**
 * Permission checks/requests for the Start Duty preconditions (PRD §7.3),
 * reused by the onboarding wizard. Order matters: mic → location while-using →
 * location always → notifications → GPS on. Battery optimisation is advisory
 * and can't be verified programmatically (self-attestation, §7.7 step 5).
 */
import * as Location from 'expo-location';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications';

export interface PreconditionStatus {
  mic: boolean;
  locationWhenInUse: boolean;
  locationAlways: boolean;
  notifications: boolean;
  gps: boolean;
}

export function allGranted(s: PreconditionStatus): boolean {
  return s.mic && s.locationAlways && s.notifications && s.gps;
}

export async function checkPreconditions(): Promise<PreconditionStatus> {
  const mic = (await getRecordingPermissionsAsync()).granted;
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  const notif = (await getPermissionsAsync()).granted;
  const gps = await Location.hasServicesEnabledAsync();
  return {
    mic,
    locationWhenInUse: fg.granted,
    locationAlways: bg.granted,
    notifications: notif,
    gps,
  };
}

export async function requestMic(): Promise<boolean> {
  return (await requestRecordingPermissionsAsync()).granted;
}

export async function requestLocationWhenInUse(): Promise<boolean> {
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

/**
 * Step 1 of Android location: the foreground ("while using") dialog. This is the
 * only location prompt that reliably shows a system pop-up on all Android
 * versions. Must be granted before background can be requested at all.
 */
export async function requestLocationForeground(): Promise<boolean> {
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

/**
 * Step 2: background ("Allow all the time"). On Android 10 this shows a dialog;
 * on Android 11+ the OS refuses to show a pop-up and the user MUST pick it from
 * the app's settings page. Returns whether it ended up granted. The caller
 * should open location settings if this returns false (see openAppLocationSettings).
 */
export async function requestLocationBackground(): Promise<boolean> {
  const cur = await Location.getBackgroundPermissionsAsync();
  if (cur.granted) return true;
  try {
    return (await Location.requestBackgroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function requestLocationAlways(): Promise<boolean> {
  // Android forces the two-step: while-using must be granted first.
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return false;
  return requestLocationBackground();
}

export async function requestNotifications(): Promise<boolean> {
  const cur = await getPermissionsAsync();
  if (cur.granted) return true;
  return (await requestPermissionsAsync()).granted;
}
