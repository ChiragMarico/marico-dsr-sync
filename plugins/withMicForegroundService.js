/**
 * Give the all-day location foreground service the `microphone` type as well.
 *
 * Why this exists
 * ---------------
 * Android 14 will not let an app start a `microphone`-type foreground service
 * from the background. expo-audio starts its recording service at the moment
 * `record()` is called — which for us is when a geofence fires, with the phone
 * in the rep's pocket. The start is refused, expo-audio catches the exception
 * and carries on (AudioRecordingService.startForegroundWithNotification), and
 * MediaRecorder then writes a file full of digital silence rather than failing.
 * That is the -91 dB recordings.
 *
 * expo-location's service does not have that problem: it is started from "Start
 * My Day", while the rep is looking at the screen, and it runs until the day
 * ends. Adding `microphone` to its type means the app holds microphone
 * while-in-use continuously from that legal foreground start, so every later
 * recording inherits it — no matter what the app is doing when the visit begins.
 *
 * The service is declared by expo-location's own manifest, so we re-declare it
 * here with `tools:replace` to win the manifest merge.
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const SERVICE = 'expo.modules.location.services.LocationTaskService';
const TYPES = 'location|microphone';

const withMicForegroundService = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;

    // `tools:replace` is what lets our declaration override the library's.
    manifest.manifest.$ = {
      ...manifest.manifest.$,
      'xmlns:tools': 'http://schemas.android.com/tools',
    };

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.service = app.service ?? [];

    const existing = app.service.find((s) => s.$?.['android:name'] === SERVICE);
    const attrs = {
      'android:name': SERVICE,
      'android:exported': 'false',
      'android:foregroundServiceType': TYPES,
      'tools:replace': 'android:foregroundServiceType',
    };

    if (existing) {
      existing.$ = { ...existing.$, ...attrs };
    } else {
      app.service.push({ $: attrs });
    }

    return cfg;
  });

module.exports = withMicForegroundService;
