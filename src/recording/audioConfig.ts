import type { RecordingOptions } from 'expo-audio';
import { AUDIO_BITRATE, AUDIO_SAMPLE_RATE } from '../constants';

/**
 * Recording format: mono AAC in an .m4a container.
 *
 * WHY outputFormat / audioEncoder ARE SET AT THE TOP LEVEL
 * --------------------------------------------------------
 * The TypeScript types put these inside the `android` block, but expo-audio's
 * Android implementation reads them FLAT off the options object:
 *
 *   data class RecordingOptions(
 *     @Field val extension: String,
 *     @Field val sampleRate: Double?,
 *     @Field val outputFormat: ...?,     // <- top level, not options.android
 *     @Field val audioEncoder: ...?,
 *   )
 *
 *   if (options.audioEncoder != null) setAudioEncoder(...)
 *   else setAudioEncoder(MediaRecorder.AudioEncoder.DEFAULT)   // AMR-NB
 *
 * With them nested, the native side saw null and fell back to Android's DEFAULT
 * encoder — AMR-NB — so every pilot recording came out as an 8 kHz phone-call
 * codec regardless of what we asked for. The sample rate followed, because
 * AMR-NB only supports 8 kHz, so setAudioSamplingRate(48000) was ignored.
 *
 * They are therefore set in BOTH places: flat for the native code that actually
 * reads them, and nested to satisfy the published types. Verify any change here
 * against a real uploaded file (ffprobe should report `aac`, not `amr_nb`) —
 * types, unit tests and the bundle check cannot catch this.
 */
export const AUDIO_OPTIONS: RecordingOptions = {
  // Record straight to the persistent document dir (not cache) so we never
  // have to move the file before upload — the move was silently dropping audio.
  directory: 'document',
  // Required for the silence watchdog: without this the recorder reports no
  // input level and we cannot tell a dead microphone from a quiet shop.
  isMeteringEnabled: true,
  extension: '.m4a',
  sampleRate: AUDIO_SAMPLE_RATE,
  numberOfChannels: 1,
  bitRate: AUDIO_BITRATE,

  // Read by the Android native module. Without these it uses AMR-NB.
  outputFormat: 'mpeg4',
  audioEncoder: 'aac',

  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: AUDIO_SAMPLE_RATE,
  },

  ios: {
    outputFormat: 'MPEG4AAC' as unknown as RecordingOptions['ios']['outputFormat'],
    audioQuality: 96 as unknown as RecordingOptions['ios']['audioQuality'],
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },

  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: AUDIO_BITRATE,
  },
  // The flat outputFormat/audioEncoder above are not in the published type.
} as RecordingOptions;
