/** Visit manifest (PRD §9). One per visit, written when the visit finalizes. */
import type { MicHealth } from './recorder';
import { APP_VERSION, BUILD_LABEL } from '../constants';

export interface ChunkMeta {
  file: string; // chunk_001.m4a
  start_ts: string; // ISO
  duration_s: number;
}

export interface GpsPoint {
  lat: number;
  lng: number;
  acc: number | null;
  ts: string; // ISO
}

export interface ManifestFlags {
  gps_gap: boolean;
  interrupted_by_call: boolean;
  recording_incomplete: boolean;
  recording_failed: boolean;
}

export interface Manifest {
  visit_id: string;
  dsr_id: string;
  outlet_id: string;
  outlet_name: string;
  date: string; // YYYY-MM-DD
  enter_ts: string;
  exit_ts: string;
  trigger: 'geofence' | 'manual';
  mic_source: 'bluetooth' | 'phone';
  chunks: ChunkMeta[];
  total_duration_s: number;
  matched_distance_m: number;
  gps_trail: GpsPoint[];
  flags: ManifestFlags;
  app_version: string;
  app_build: string;
  /**
   * What the microphone actually produced. Android reports a denied mic as
   * silence rather than an error, so without this a lost visit is
   * indistinguishable from a quiet one until someone probes the audio.
   */
  mic_health?: MicHealth;
  device: { model: string; os: string };
}

export function emptyFlags(): ManifestFlags {
  return {
    gps_gap: false,
    interrupted_by_call: false,
    recording_incomplete: false,
    recording_failed: false,
  };
}

export function newManifest(init: {
  visit_id: string;
  dsr_id: string;
  outlet_id: string;
  outlet_name: string;
  date: string;
  enter_ts: string;
  trigger: 'geofence' | 'manual';
  matched_distance_m: number;
  deviceModel: string;
  osVersion: string;
}): Manifest {
  return {
    visit_id: init.visit_id,
    dsr_id: init.dsr_id,
    outlet_id: init.outlet_id,
    outlet_name: init.outlet_name,
    date: init.date,
    enter_ts: init.enter_ts,
    exit_ts: init.enter_ts,
    trigger: init.trigger,
    mic_source: 'phone',
    chunks: [],
    total_duration_s: 0,
    matched_distance_m: init.matched_distance_m,
    gps_trail: [],
    flags: emptyFlags(),
    app_version: APP_VERSION,
    app_build: BUILD_LABEL,
    device: { model: init.deviceModel, os: init.osVersion },
  };
}
