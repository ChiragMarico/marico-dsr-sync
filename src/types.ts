/** Days of the week the beat plan uses (from the pushed outlet data). */
export type DayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const DAY_KEYS: DayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/** The DayKey for today, using local time (Mon–Sun). */
export function todayKey(d = new Date()): DayKey {
  // getDay(): Sun=0..Sat=6 → shift so Monday is index 0.
  return DAY_KEYS[(d.getDay() + 6) % 7];
}

export interface Outlet {
  outlet_id: string;
  name: string;
  lat: number;
  lng: number;
  dsr_id: string;
  enter_radius_m?: number;
  exit_radius_m?: number;
  // Beat plan: true on the days this outlet is scheduled for. Absent on
  // old-format data and dev test outlets (treated as "every day").
  monday?: boolean;
  tuesday?: boolean;
  wednesday?: boolean;
  thursday?: boolean;
  friday?: boolean;
  saturday?: boolean;
  sunday?: boolean;
}

/** True if this outlet carries beat-day flags (vs old data / test outlets). */
export function outletHasDays(o: Outlet): boolean {
  return DAY_KEYS.some((d) => typeof o[d] === 'boolean');
}

export interface DsrProfile {
  id: string;
  name: string;
}

export interface Session {
  token: string;
  dsr: DsrProfile;
  /** ISO timestamp when the token expires (30 days from login). */
  expires: string;
}

export interface AuthResponse {
  token: string;
  dsr: DsrProfile;
  expires: string;
}

export interface ConfigResponse {
  outlets: Outlet[];
  version: string;
}

export interface SignResponse {
  url: string;
  expires_in: number;
}

/** Errors the API client can surface — screens map these to bilingual copy. */
export type ApiErrorKind = 'unauthorized' | 'offline' | 'server' | 'timeout';

export class ApiError extends Error {
  kind: ApiErrorKind;
  constructor(kind: ApiErrorKind, message?: string) {
    super(message ?? kind);
    this.kind = kind;
  }
}
