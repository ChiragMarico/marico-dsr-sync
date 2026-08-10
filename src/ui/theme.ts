/**
 * Design tokens — the approved "Marico premium" direction (cobalt + lima,
 * glass depth, signature gradient). One source of truth for every screen so
 * the real app matches the approved mockup. When Marico's brand team supplies
 * the exact hex + logo + font, swap them here and the whole app updates.
 */
import { Platform, TextStyle, ViewStyle } from 'react-native';

export const C = {
  // Sync identity (green → royal blue). Keys kept as cobalt/lima to avoid a
  // wide refactor; values are the Sync brand colours.
  cobalt: '#1C5AA8', // Sync royal blue (primary)
  cobaltDeep: '#123A78',
  lima: '#7FC241', // Sync green (accent)
  limaBright: '#98D24F',
  rec: '#FF5A4D',
  recDeep: '#E0362B',
  amber: '#FFB23E',

  // App light theme (field-usable, sunlight-readable)
  bg: '#F3F5FB',
  surface: '#FFFFFF',
  surface2: '#F7F9FE',
  ink: '#0A1020',
  mid: '#59617A',
  low: '#8A92A8',
  line: '#E9EDF6',

  // Semantic
  ok: '#17924A',
  okTint: 'rgba(23,146,74,0.12)',
  waitTint: 'rgba(255,178,62,0.16)',
  waitText: '#B5760A',
  white: '#FFFFFF',
};

/** Signature Sync gradient (green → blue), matching the logo. */
export const GRAD = ['#8CC63F', '#2E86C9', '#1C5AA8'] as const;
export const GRAD_SOFT = ['#8CC63F', '#4AA0C8', '#1C5AA8'] as const;
export const GRAD_STOP = ['#FF5A4D', '#E0362B'] as const;
export const GRAD_START = { x: 0, y: 0 };
export const GRAD_END = { x: 1, y: 1 };

export const R = { sm: 12, md: 16, lg: 20, xl: 24, pill: 100 };
export const SP = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 };

export const SHADOW: Record<'card' | 'raised' | 'brand' | 'stop', ViewStyle> = {
  card: {
    shadowColor: '#0A1020',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0A1020',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  brand: {
    shadowColor: C.cobalt,
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  stop: {
    shadowColor: C.rec,
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
};

const sys = Platform.select({ android: 'sans-serif', default: 'System' });

export const T: Record<string, TextStyle> = {
  display: { fontFamily: sys, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: C.ink },
  h1: { fontFamily: sys, fontSize: 23, fontWeight: '800', letterSpacing: -0.4, color: C.ink },
  h2: { fontFamily: sys, fontSize: 18, fontWeight: '800', letterSpacing: -0.2, color: C.ink },
  body: { fontFamily: sys, fontSize: 15, fontWeight: '500', color: C.ink },
  label: { fontFamily: sys, fontSize: 12, fontWeight: '700', letterSpacing: 0.2, color: C.mid },
  caption: { fontFamily: sys, fontSize: 12, fontWeight: '600', color: C.low },
};
