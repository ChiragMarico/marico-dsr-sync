import type { RecordingOptions } from 'expo-audio';
import { AUDIO_BITRATE, AUDIO_SAMPLE_RATE } from '../constants';

/**
 * Speech-quality AAC: mono, 16 kHz, 32 kbps → ~240 KB / 2-min chunk (PRD §7.5).
 * `.m4a` container (mpeg4 output format) with the AAC encoder on Android.
 */
export const AUDIO_OPTIONS: RecordingOptions = {
  // Record straight to the persistent document dir (not cache) so we never
  // have to move the file before upload — the move was silently dropping audio.
  directory: 'document',
  extension: '.m4a',
  sampleRate: AUDIO_SAMPLE_RATE,
  numberOfChannels: 1,
  bitRate: AUDIO_BITRATE,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    // iOS is out of scope (Android-only pilot); kept for type completeness.
    outputFormat: 'MPEG4AAC' as unknown as RecordingOptions['ios']['outputFormat'],
    audioQuality: 32 as unknown as RecordingOptions['ios']['audioQuality'],
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: AUDIO_BITRATE,
  },
};
