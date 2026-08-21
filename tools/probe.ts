/**
 * Measure the actual loudness of a rep's uploaded audio.
 *
 * The app's own mic_health only exists from v8.2 onward, so establishing what
 * older builds captured means going to the files themselves. Prints peak and
 * mean dB per clip; a genuinely dead microphone reads around -91 dB (digital
 * silence) while even an empty shop reads about -50 dB from room tone.
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
  const uri = key ? '/' + key.split('/').map(enc).join('/') : '/';
  const cr = [method, uri, cq, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sts = ['AWS4-HMAC-SHA256', iso, scope, sha256(cr)].join('\n');
  let k: any = 'AWS4' + S3.secretAccessKey;
  for (const x of [ds, S3.region, 's3', 'aws4_request']) k = hmac(k, x);
  return `https://${host}${uri}?${cq}&X-Amz-Signature=${sha256.hmac(k, sts)}`;
}

async function listAll(prefix: string) {
  let token: string | undefined;
  const out: { key: string; modified: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const q: Record<string, string> = { prefix, 'list-type': '2' };
    if (token) q['continuation-token'] = token;
    const xml = await (await fetch(signed('GET', '', q))).text();
    for (const b of xml.split('<Contents>').slice(1)) {
      const key = b.match(/<Key>([^<]+)/)?.[1];
      if (key) out.push({ key, modified: b.match(/<LastModified>([^<]+)/)?.[1] ?? '' });
    }
    token = xml.match(/<NextContinuationToken>([^<]+)/)?.[1];
    if (!token) break;
  }
  return out;
}

const ist = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });

(async () => {
  const dsr = process.argv[2];
  const limit = +(process.argv[3] ?? 6);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const all = await listAll(S3.prefix);
  const clips = all
    .filter((o) => o.key.includes(dsr) && /\.(m4a|mp4|amr|aac)$/.test(o.key))
    .filter((o) => new Date(o.modified).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === today)
    .sort((a, b) => a.modified.localeCompare(b.modified))
    .slice(0, limit);

  console.log(`\n=== ${dsr} — measuring ${clips.length} clips (${today} IST) ===\n`);
  for (const c of clips) {
    // Fetch to disk first: ffmpeg's https reader chokes on the long signed
    // query string, and these clips are a few MB at most.
    const tmp = join(tmpdir(), `probe-${c.key.replace(/[^\w.]/g, '_')}`);
    let out = '';
    try {
      const buf = Buffer.from(await (await fetch(signed('GET', c.key))).arrayBuffer());
      writeFileSync(tmp, buf);
      // volumedetect reports on stderr, so both streams have to be read.
      const r = spawnSync(
        'ffmpeg',
        ['-nostdin', '-hide_banner', '-i', tmp, '-af', 'volumedetect', '-f', 'null', '-'],
        { encoding: 'utf8', maxBuffer: 1 << 28 },
      );
      out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    } catch (e: any) {
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    } finally {
      try { unlinkSync(tmp); } catch { /* already gone */ }
    }
    const peak = out.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1];
    const mean = out.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1];
    const codec = out.match(/Audio: (\w+)[^,]*, (\d+) Hz/);
    const dead = peak != null && +peak <= -80;
    console.log(
      `${ist(c.modified)}  peak ${String(peak ?? '?').padStart(7)}dB  mean ${String(mean ?? '?').padStart(7)}dB  ` +
        `${codec ? `${codec[1]} ${codec[2]}Hz` : '?'}  ${dead ? '← SILENT' : ''}`,
    );
  }
})();
