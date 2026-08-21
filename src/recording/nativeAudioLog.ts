/**
 * Surface the native audio errors that expo-audio swallows.
 *
 * When Android refuses to start the microphone foreground service,
 * `AudioRecordingService.startForegroundWithNotification()` catches the
 * exception and reports it only to `appContext.jsLogger` — which
 * expo-modules-core wires to the console in __DEV__ builds and nowhere at all
 * in release. The recording then proceeds with no microphone grant and writes
 * silence. That is why the failure has been invisible in the field.
 *
 * The native module emits those messages as events regardless of build type, so
 * we subscribe ourselves and attach whatever arrives during a recording to that
 * visit's manifest. This turns an inference about why recordings are silent
 * into something the rep's own phone reports.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

const NativeJSLogger = requireOptionalNativeModule<{
  addListener: (event: string, cb: (e: { message: string }) => void) => unknown;
}>('ExpoModulesCoreJSLogger');

/** Keep the manifest small — the first few messages carry the diagnosis. */
const MAX_KEPT = 5;

/** Only audio-path errors are useful here; ignore unrelated module noise. */
const RELEVANT = /audio|record|foreground|service|microphone|mic\b/i;

let buffer: string[] = [];
let subscribed = false;

function ensureSubscribed(): void {
  if (subscribed || !NativeJSLogger) return;
  subscribed = true;
  for (const event of [
    'ExpoModulesCoreJSLogger.onNewError',
    'ExpoModulesCoreJSLogger.onNewWarning',
  ]) {
    try {
      NativeJSLogger.addListener(event, ({ message }) => {
        if (!message || !RELEVANT.test(message)) return;
        if (buffer.length < MAX_KEPT) buffer.push(message);
      });
    } catch {
      /* listener unavailable on this build — telemetry only, never fatal */
    }
  }
}

/** Begin a fresh capture window for one recording. */
export function beginNativeLogCapture(): void {
  ensureSubscribed();
  buffer = [];
}

/** Native audio errors seen since the last begin(). */
export function collectNativeLogs(): string[] {
  return [...buffer];
}
