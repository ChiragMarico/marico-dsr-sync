/**
 * In-process mock of the Lambda (PRD §8.2) so Phase 1–4 run on a device with
 * zero backend. Mirrors the exact request/response contract of the real
 * function; swap API_MODE to 'live' in constants.ts once the Lambda exists.
 *
 * Mock DSRs (PIN in comment — dev only):
 *   1023 / 1234  — Ramesh Kumar
 *   1024 / 4321  — Suresh Yadav
 */
import { AuthResponse, ConfigResponse, Outlet, SignResponse } from '../types';

const MOCK_DSRS = [
  { dsr_id: '1023', name: 'Ramesh Kumar', pin: '1234', active: true },
  { dsr_id: '1024', name: 'Suresh Yadav', pin: '4321', active: true },
];

// Sample beat around Andheri East, Mumbai — replace with real outlets.json
// generated from the client Excel (open item, PRD §12).
const MOCK_OUTLETS: Outlet[] = [
  { outlet_id: 'OUT-00417', name: 'Sharma General Store', lat: 19.119677, lng: 72.847231, dsr_id: '1023' },
  { outlet_id: 'OUT-00418', name: 'Gupta Kirana', lat: 19.121542, lng: 72.849876, dsr_id: '1023' },
  { outlet_id: 'OUT-00419', name: 'New Bombay Stores', lat: 19.117203, lng: 72.851114, dsr_id: '1023' },
  { outlet_id: 'OUT-00420', name: 'Balaji Super Mart', lat: 19.115881, lng: 72.845502, dsr_id: '1023' },
  { outlet_id: 'OUT-00421', name: 'Om Sai Provision', lat: 19.123310, lng: 72.844190, dsr_id: '1023' },
  { outlet_id: 'OUT-00501', name: 'Krishna Traders', lat: 19.129000, lng: 72.856000, dsr_id: '1024' },
];

const LATENCY_MS = 400;
const delay = () => new Promise((r) => setTimeout(r, LATENCY_MS));

export async function mockAuth(dsr_id: string, pin: string): Promise<AuthResponse | null> {
  await delay();
  const dsr = MOCK_DSRS.find((d) => d.dsr_id === dsr_id && d.pin === pin && d.active);
  if (!dsr) return null; // caller maps to 401
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  return {
    token: `mock-token-${dsr.dsr_id}`,
    dsr: { id: dsr.dsr_id, name: dsr.name },
    expires,
  };
}

export async function mockConfig(dsr_id: string, token: string): Promise<ConfigResponse | null> {
  await delay();
  if (token !== `mock-token-${dsr_id}`) return null;
  return {
    outlets: MOCK_OUTLETS.filter((o) => o.dsr_id === dsr_id),
    version: 'mock-1',
  };
}

export async function mockSign(
  dsr_id: string,
  token: string,
  s3_key: string,
): Promise<SignResponse | null> {
  await delay();
  if (token !== `mock-token-${dsr_id}`) return null;
  const ok =
    s3_key.startsWith(`recordings/${dsr_id}/`) || s3_key.startsWith(`logs/${dsr_id}/`);
  if (!ok) return null;
  // Not a real URL — Phase 5 upload worker treats mock URLs as instant success.
  return { url: `mock://s3/${s3_key}`, expires_in: 900 };
}
