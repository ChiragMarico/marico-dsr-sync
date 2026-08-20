import { RecordingPresets, type RecordingOptions } from 'expo-audio';
import { AUDIO_BITRATE, AUDIO_SAMPLE_RATE } from '../constants';

/**
 * Recording format: mono AAC in an .m4a container.
 *
 * WHY THIS IS BUILT ON A PRESET RATHER THAN HAND-ROLLED
 * -----------------------------------------------------
 * The previous version set sampleRate/bitRate only at the TOP level and gave
 * the `android` block just outputFormat + audioEncoder. On device that silently
 * produced **AMR-NB at 8 kHz / 12.8 kbps** — Android's fallback codec, the one
 * used for 2G phone calls — instead of the 44.1 kHz AAC we asked for. Every
 * pilot recording came out telephone-quality and sounded muffled.
 *
 * Android reads its settings from the `android` block, so anything that matters
 * must be repeated there, not just at the top level. We now spread
 * RecordingPresets.HIGH_QUALITY (expo's own tested configuration) and override
 * explicitly in BOTH places, so a missing key can never fall back to AMR again.
 *
 * Mono at 64 kbps: speech needs no stereo, and 64 kbps mono AAC is transparent
 * for voice while being a third the size of the old 192 kbps setting.
 */
export const AUDIO_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,

  // Record straight to the persistent document dir (not cache) so we never
  // have to move the file before upload — the move was silently dropping audio.
  directory: 'document',
  extension: '.m4a',
  sampleRate: AUDIO_SAMPLE_RATE,
  numberOfChannels: 1,
  bitRate: AUDIO_BITRATE,

  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    // Repeated here deliberately — this is the block Android actually reads.
    sampleRate: AUDIO_SAMPLE_RATE,
  },

  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
  },

  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: AUDIO_BITRATE,
  },
};
