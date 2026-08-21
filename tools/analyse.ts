/**
 * Full day analysis for one DSR: every visit, whether the microphone actually
 * captured anything, and which build produced it.
 *
 * Combines two independent sources deliberately — the app's own mic_health
 * (what the recorder believed) and ffmpeg's measurement of the uploaded file
 * (what actually landed). When those two disagree, that disagreement is the
 * interesting result.
 */
import { sha256 } from 'js-sha256';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3 } from '../src/config/s3Config';

const hmac = (k: any, d: string) => new Uint8Array(sha256.hmac.arrayBuffer(k, d));
const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function signed(key: string, query: Record<string, string> = {}): string {
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
  const uri = key ? '/' + key.split('/').map(enc).join('/') : '/';
  const cr = ['GET', uri, cq, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sts = ['AWS4-HMAC-SHA256', iso, scope, sha256(cr)].join('\n');
  let k: any = 'AWS4' + S3.secretAccessKey;
  for (const x of [ds, S3.region, 's3', 'aws4_request']) k = hmac(k, x);
  return `https://${host}${uri}?${cq}&X-Amz-Signature=${sha256.hmac(k, sts)}`;
}

async function listAll(prefix: string) {
  let token: string | undefined;
  const out: { key: string; size: number; modified: string }[] = [];
  for (let i = 0; i < 40; i++) {
    const q: Record<string, string> = { prefix, 'list-type': '2' };
    if (token) q['continuation-token'] = token;
    const xml = await (await fetch(signed('', q))).text();
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

/** Peak/mean dB of an uploaded clip, measured rather than trusted. */
function measure(key: string): { peak: number | null; mean: number | null } {
  const tmp = join(tmpdir(), `an-${Math.abs(hashCode(key))}.m4a`);
  try {
    const r = spawnSync('curl', ['-sL', '-o', tmp, signed(key)], { encoding: 'utf8' });
    if (r.status !== 0) return { peak: null, mean: null };
    const f = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-i', tmp, '-af', 'volumedetect', '-f', 'null', '-'], {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    });
    const out = `${f.stdout ?? ''}${f.stderr ?? ''}`;
    const p = out.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1];
    const m = out.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1];
    return { peak: p ? +p : null, mean: m ? +m : null };
  } finally {
    try { unlinkSync(tmp); } catch { /* nothing to clean */ }
  }
}
const hashCode = (s: string) => s.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);

const ist = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

(async () => {
  const dsr = process.argv[2] ?? '4245-13';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const all = await listAll(S3.prefix);
  const mine = all.filter(
    (o) => o.key.includes(dsr) &&
      new Date(o.modified).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === today,
  );

  const manifests = mine.filter((o) => o.key.endsWith('manifest.json')).sort((a, b) => a.modified.localeCompare(b.modified));
  const rows: any[] = [];

  for (const m of manifests) {
    let j: any = {};
    try { j = await (await fetch(signed(m.key))).json(); } catch { continue; }
    const audioKey = m.key.replace(/manifest\.json$/, 'chunk_001.m4a');
    const audio = mine.find((o) => o.key === audioKey);
    const vol = audio ? measure(audioKey) : { peak: null, mean: null };
    rows.push({
      time: ist(m.modified),
      outlet: (j.outlet_name ?? j.outlet_id ?? '?').slice(0, 26),
      dur: j.total_duration_s ?? 0,
      build: (j.app_build ?? '?').split('·')[0].trim(),
      trigger: j.trigger ?? j.start_reason ?? '?',
      health: j.mic_health ?? null,
      bytes: audio?.size ?? 0,
      ...vol,
      flags: Object.entries(j.flags ?? {}).filter(([, v]) => v).map(([k]) => k),
    });
  }

  console.log(`\n${'='.repeat(104)}`);
  console.log(` DSR ${dsr} — ${today} IST — ${rows.length} visits`);
  console.log('='.repeat(104));
  console.log(
    ' time     dur    MB    measured        app verdict            build  outlet',
  );
  console.log('-'.repeat(104));

  for (const r of rows) {
    const meas = r.peak == null ? '   ?    ' : r.peak <= -80 ? ' SILENT ' : `${String(r.mean).padStart(6)}dB`;
    const h = r.health;
    const verdict = !h
      ? 'no telemetry      '
      : `${h.wasSilent ? 'SILENT' : 'AUDIO '} ${String(h.startedInState).padEnd(10)}`;
    const rec = h?.recoveryAttempts ? `↻${h.recoveryAttempts}` : '  ';
    console.log(
      ` ${r.time}  ${mmss(r.dur).padStart(5)}  ${(r.bytes / 1e6).toFixed(1).padStart(4)}  ${meas}  ${verdict} ${rec}  ${r.build.padEnd(5)}  ${r.outlet}`,
    );
    for (const e of h?.nativeErrors ?? []) console.log(`            ⚠ ${e}`);
    if (r.flags.length) console.log(`            flags: ${r.flags.join(', ')}`);
  }

  const silent = rows.filter((r) => r.peak != null && r.peak <= -80);
  const good = rows.filter((r) => r.peak != null && r.peak > -80);
  const secGood = good.reduce((a, r) => a + r.dur, 0);
  const secLost = silent.reduce((a, r) => a + r.dur, 0);

  console.log('-'.repeat(104));
  console.log(` captured : ${good.length}/${rows.length} visits   ${mmss(secGood)} of audio`);
  console.log(` lost     : ${silent.length}/${rows.length} visits   ${mmss(secLost)} of silence`);
  console.log(` rate     : ${rows.length ? Math.round((good.length / rows.length) * 100) : 0}% usable`);
})();
