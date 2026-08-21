/**
 * Litmus watcher for the microphone foreground-service fix.
 *
 * Reports every visit a given DSR has uploaded today with the app's own
 * verdict on whether the microphone actually produced sound — plus, on v8.4+,
 * the native error expo-audio swallowed, which says outright whether Android
 * refused the microphone foreground service.
 */
import { sha256 } from 'js-sha256';
import { S3 } from '../src/config/s3Config';

const DSR = process.argv[2] ?? '4245-13';

const hmac = (k: any, d: string) => new Uint8Array(sha256.hmac.arrayBuffer(k, d));
const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encPath = (k: string) => '/' + k.split('/').map(enc).join('/');

function signed(method: string, key: string, query: Record<string, string> = {}): string {
  const host = `${S3.bucket}.s3.${S3.region}.amazonaws.com`;
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const ds = iso.slice(0, 8);
  const scope = `${ds}/${S3.region}/s3/aws4_request`;
  const q: Record<string, string> = {
    ...query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${S3.accessKeyId}/${scope}`,
    'X-Amz-Date': iso,
    'X-Amz-Expires': '900',
    'X-Amz-SignedHeaders': 'host',
  };
  const cq = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const uri = key ? encPath(key) : '/';
  const cr = [method, uri, cq, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sts = ['AWS4-HMAC-SHA256', iso, scope, sha256(cr)].join('\n');
  let k: any = 'AWS4' + S3.secretAccessKey;
  for (const x of [ds, S3.region, 's3', 'aws4_request']) k = hmac(k, x);
  return `https://${host}${uri}?${cq}&X-Amz-Signature=${sha256.hmac(k, sts)}`;
}

interface Obj { key: string; size: number; modified: string }

async function listAll(prefix: string): Promise<Obj[]> {
  let token: string | undefined;
  const out: Obj[] = [];
  for (let i = 0; i < 30; i++) {
    const q: Record<string, string> = { prefix, 'list-type': '2' };
    if (token) q['continuation-token'] = token;
    const xml = await (await fetch(signed('GET', '', q))).text();
    for (const b of xml.split('<Contents>').slice(1)) {
      const key = b.match(/<Key>([^<]+)/)?.[1];
      if (!key) continue;
      out.push({
        key,
        size: +(b.match(/<Size>(\d+)/)?.[1] ?? 0),
        modified: b.match(/<LastModified>([^<]+)/)?.[1] ?? '',
      });
    }
    token = xml.match(/<NextContinuationToken>([^<]+)/)?.[1];
    if (!token) break;
  }
  return out;
}

const ist = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const all = await listAll(S3.prefix);
  const mine = all.filter((o) => o.key.includes(DSR));
  const todays = mine.filter(
    (o) => new Date(o.modified).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === today,
  );

  console.log(`\n=== DSR ${DSR} — ${today} IST ===`);
  console.log(`objects today: ${todays.length}  (all-time: ${mine.length})`);
  if (!todays.length) {
    const last = mine.sort((a, b) => b.modified.localeCompare(a.modified))[0];
    console.log(last ? `last upload ever: ${last.modified} — ${last.key}` : 'nothing ever uploaded');
    return;
  }

  const manifests = todays.filter((o) => o.key.endsWith('manifest.json')).sort((a, b) => a.modified.localeCompare(b.modified));
  const audio = todays.filter((o) => /\.(m4a|mp4|amr|aac)$/.test(o.key));

  console.log(`audio files: ${audio.length}   manifests: ${manifests.length}\n`);

  const builds = new Set<string>();
  const devices = new Set<string>();
  let good = 0, silent = 0, unknown = 0;
  for (const m of manifests) {
    let j: any = {};
    try { j = await (await fetch(signed('GET', m.key))).json(); } catch { /* unreadable */ }
    const h = j.mic_health;
    const dur = j.total_duration_s != null ? `${j.total_duration_s}s` : '—';
    const outlet = j.outlet_name ?? j.outlet_id ?? '?';
    builds.add(`${j.app_version ?? '?'} / ${j.app_build ?? '?'}`);
    if (j.device?.model) devices.add(`${j.device.model} (${j.device.os})`);
    if (!h) {
      unknown++;
      console.log(`${ist(m.modified)}  ${dur.padStart(6)}  ${outlet}  · no mic_health (pre-v8.2 build)`);
      continue;
    }
    const verdict = h.wasSilent ? 'SILENT' : 'AUDIO ';
    if (h.wasSilent) silent++; else good++;
    const rec = h.recoveryAttempts ? ` recovery×${h.recoveryAttempts}${h.recoveredWith ? `→${h.recoveredWith}` : ''}` : '';
    console.log(
      `${ist(m.modified)}  ${dur.padStart(6)}  ${verdict} peak ${String(Math.round(h.peakDb)).padStart(4)}dB  started:${h.startedInState}${rec}  ${outlet}`,
    );
    for (const e of h.nativeErrors ?? []) console.log(`            ⚠ ${e}`);
  }
  console.log(`\n--- audio ${good} · silent ${silent} · unknown ${unknown} ---`);
  console.log(`build(s) seen today : ${[...builds].join('  |  ') || '—'}`);
  console.log(`device(s)           : ${[...devices].join('  |  ') || '—'}`);
})();
