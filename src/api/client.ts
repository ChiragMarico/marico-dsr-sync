/**
 * Single client for the Lambda Function URL (PRD §8.2). All three actions
 * (auth / config / sign) go through one POST endpoint with an `action` field.
 * In mock mode (constants.API_MODE) calls are served in-process.
 */
import { API_MODE, API_TIMEOUT_MS, LAMBDA_URL } from '../constants';
import {
  ApiError,
  AuthResponse,
  ConfigResponse,
  SignResponse,
} from '../types';
import { mockAuth, mockConfig, mockSign } from './mock';
import { checkDsrSecret, fetchOutletsForDsr, findLiveDsr } from '../config/liveConfig';

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') throw new ApiError('timeout');
    throw new ApiError('offline'); // fetch TypeError = no network / DNS
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new ApiError('unauthorized');
  if (!res.ok) throw new ApiError('server', `HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Normalize the Lambda's `expires` (epoch seconds) to an ISO string, which is
 * what the rest of the app (session store) expects. Passes ISO strings through
 * unchanged so mock mode also works.
 */
function normalizeExpires(res: AuthResponse): AuthResponse {
  const e = res.expires as unknown;
  if (typeof e === 'number') {
    const ms = e < 1e12 ? e * 1000 : e; // seconds vs millis
    return { ...res, expires: new Date(ms).toISOString() };
  }
  return res;
}

export async function apiAuth(dsr_id: string, pin: string): Promise<AuthResponse> {
  // Built-in dev accounts (1023/1024) always work — keeps the testing flow intact.
  const dev = await mockAuth(dsr_id, pin);
  if (dev) return dev;
  // Real DSRs from the live S3 config: DSR ID + last-4-of-phone.
  const dsr = await findLiveDsr(dsr_id);
  if (!dsr || !checkDsrSecret(dsr, pin)) throw new ApiError('unauthorized');
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  return { token: `s3-${dsr.dsr_id}`, dsr: { id: dsr.dsr_id, name: dsr.name }, expires };
}

export async function apiConfig(dsr_id: string, token: string): Promise<ConfigResponse> {
  // Dev accounts use the built-in sample outlets (testing tools depend on these).
  const dev = await mockConfig(dsr_id, token);
  if (dev) return dev;
  // Real DSR → download only this DSR's outlets from S3.
  const outlets = await fetchOutletsForDsr(dsr_id);
  return { outlets, version: 's3-live' };
}

export async function apiSign(
  dsr_id: string,
  token: string,
  s3_key: string,
  content_type: string,
): Promise<SignResponse> {
  if (API_MODE === 'mock') {
    const r = await mockSign(dsr_id, token, s3_key);
    if (!r) throw new ApiError('unauthorized');
    return r;
  }
  return post<SignResponse>({ action: 'sign', dsr_id, token, s3_key, content_type });
}
