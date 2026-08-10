/**
 * Reads the live DSR + outlet config that the Snowflake connector writes to S3
 * (client-side, no backend). Login validates against dsrs.json; outlets are
 * pulled per-DSR so each rep only downloads their own ~230 shops.
 *
 *   sync/config/dsrs.json                 [{ dsr_id, name, phone }]
 *   sync/config/outlets/{dsr_id}.json     [{ outlet_id, name, lat, lng, dsr_id }]
 */
import { presignFullKey } from '../upload/s3Presign';
import { ApiError, Outlet } from '../types';

const PREFIX = 'sync/config';

export interface LiveDsr {
  dsr_id: string;
  name: string;
  phone: string;
}

let dsrCache: { at: number; list: LiveDsr[] } | null = null;
const DSR_TTL_MS = 10 * 60 * 1000;

async function getJson(key: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(presignFullKey(key));
  } catch {
    throw new ApiError('offline');
  }
  if (res.status === 403 || res.status === 401) throw new ApiError('unauthorized');
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError('server', `HTTP ${res.status}`);
  return res.json();
}

async function fetchDsrs(): Promise<LiveDsr[]> {
  if (dsrCache && Date.now() - dsrCache.at < DSR_TTL_MS) return dsrCache.list;
  const raw = (await getJson(`${PREFIX}/dsrs.json`)) as LiveDsr[] | null;
  const list = Array.isArray(raw) ? raw : [];
  dsrCache = { at: Date.now(), list };
  return list;
}

export async function findLiveDsr(dsrId: string): Promise<LiveDsr | null> {
  const id = dsrId.trim();
  const list = await fetchDsrs();
  return list.find((d) => String(d.dsr_id).trim() === id) ?? null;
}

/** Login secret = last 4 digits of the DSR's phone. */
export function checkDsrSecret(dsr: LiveDsr, entered: string): boolean {
  const last4 = String(dsr.phone).replace(/\D/g, '').slice(-4);
  return last4.length === 4 && entered === last4;
}

export async function fetchOutletsForDsr(dsrId: string): Promise<Outlet[]> {
  const raw = (await getJson(`${PREFIX}/outlets/${dsrId.trim()}.json`)) as Outlet[] | null;
  return Array.isArray(raw) ? raw : [];
}
