/**
 * Pilot monitor — a local dashboard showing which DSRs are actually working.
 *
 *   npx tsx tools/pilot-monitor.ts       then open http://localhost:7788
 *
 * Runs entirely on your machine using the credentials already in
 * src/config/s3Config.ts. Nothing is deployed and nothing is exposed — this is
 * a tool for whoever runs the pilot, not something to hand to ASMs. When the
 * backend exists these same views move behind a proper login.
 *
 * Recordings are the live signal, not day logs: a day log is only uploaded when
 * a rep ENDS their day, so it tells you nothing about someone mid-shift.
 * Recordings arrive continuously as they work.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createServer } = require('http') as typeof import('http');
import { sha256 } from 'js-sha256';
import { S3 } from '../src/config/s3Config';

const PORT = 7788;
/** A rep is "active" if something arrived within this window. */
const ACTIVE_MINUTES = 45;

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

const IST = (iso: string) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }).slice(-8) : '—';
const minsAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;

async function buildReport() {
  const [recs, prints] = await Promise.all([
    listAll('marico-dsr/recordings/'),
    listAll('marico-dsr/sync/voiceprints/'),
  ]);

  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const audio = recs.filter((r) => r.key.endsWith('.m4a'));

  // Group by DSR. Key shape: marico-dsr/recordings/{dsr}/{date}/...
  const byDsr = new Map<string, { today: number; total: number; last: string; bytes: number }>();
  for (const a of audio) {
    const dsr = a.key.split('/')[2] ?? '?';
    const d = byDsr.get(dsr) ?? { today: 0, total: 0, last: '', bytes: 0 };
    d.total++;
    const istDate = new Date(a.modified).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (istDate === todayIST) { d.today++; d.bytes += a.size; }
    if (a.modified > d.last) d.last = a.modified;
    byDsr.set(dsr, d);
  }

  const enrolled = new Set(
    prints.filter((p) => p.key.endsWith('.m4a')).map((p) => p.key.split('/')[3] ?? '?'),
  );

  const rows = [...byDsr.entries()]
    .map(([dsr, d]) => ({
      dsr,
      ...d,
      mins: d.last ? minsAgo(d.last) : Infinity,
      enrolled: enrolled.has(dsr),
      isTest: dsr === '1023' || dsr === '1024',
    }))
    .sort((a, b) => a.mins - b.mins);

  // Reps with a voiceprint but no recordings would otherwise be invisible.
  for (const e of enrolled) {
    if (!byDsr.has(e)) {
      rows.push({ dsr: e, today: 0, total: 0, last: '', bytes: 0, mins: Infinity, enrolled: true, isTest: e === '1023' || e === '1024' });
    }
  }

  return { rows, todayIST, totalToday: rows.reduce((s, r) => s + r.today, 0) };
}

function page(r: Awaited<ReturnType<typeof buildReport>>) {
  const active = r.rows.filter((x) => x.mins <= ACTIVE_MINUTES && !x.isTest).length;
  const real = r.rows.filter((x) => !x.isTest);

  const cells = r.rows.map((x) => {
    const live = x.mins <= ACTIVE_MINUTES;
    const stale = x.mins > ACTIVE_MINUTES && x.mins < 1e9;
    const status = live ? ['●', '#17803D', 'Active'] : stale ? ['●', '#A96908', 'Idle'] : ['○', '#8A93A8', 'No recordings'];
    return `<tr class="${x.isTest ? 'test' : ''}">
      <td><b>${x.dsr}</b>${x.isTest ? ' <span class="tag">test</span>' : ''}</td>
      <td style="color:${status[1]}">${status[0]} ${status[2]}</td>
      <td class="n">${x.today || '—'}</td>
      <td class="n">${x.today ? (x.bytes / 1048576).toFixed(1) + ' MB' : '—'}</td>
      <td class="n">${x.last ? IST(x.last) : '—'}</td>
      <td class="n">${x.mins < 1e9 ? Math.round(x.mins) + ' min' : '—'}</td>
      <td>${x.enrolled ? '<span style="color:#17803D">✓</span>' : '<span style="color:#C4362B">✗ missing</span>'}</td>
      <td class="n">${x.total}</td>
    </tr>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Sync pilot monitor</title><meta http-equiv="refresh" content="60">
<style>
 body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#F5F7FB;color:#0F1523}
 .wrap{max-width:1000px;margin:0 auto;padding:32px 24px 60px}
 h1{font-size:26px;margin:0 0 4px;letter-spacing:-.02em}
 .sub{color:#5A6478;font-size:14px;margin:0 0 26px}
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:26px}
 .card{background:#fff;border:1px solid #E2E8F2;border-radius:12px;padding:18px}
 .card .k{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#5A6478;font-weight:600}
 .card .v{font-size:30px;font-weight:800;margin-top:6px;letter-spacing:-.02em}
 table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #E2E8F2;border-radius:12px;overflow:hidden;font-size:14px}
 th{text-align:left;padding:11px 14px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5A6478;border-bottom:1px solid #E2E8F2}
 td{padding:11px 14px;border-bottom:1px solid #F0F3F9}
 tr:last-child td{border-bottom:0}
 tr.test{opacity:.55}
 .n{font-variant-numeric:tabular-nums}
 .tag{font-size:10px;background:#EEF1F7;padding:2px 6px;border-radius:4px;color:#5A6478}
 .foot{margin-top:18px;color:#8A93A8;font-size:12.5px;line-height:1.6}
</style></head><body><div class="wrap">
<h1>Sync pilot monitor</h1>
<p class="sub">${r.todayIST} · refreshed ${new Date().toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})} IST · auto-refreshes every 60s</p>
<div class="cards">
  <div class="card"><div class="k">Active now</div><div class="v" style="color:#17803D">${active}</div></div>
  <div class="card"><div class="k">Reps seen</div><div class="v">${real.length}</div></div>
  <div class="card"><div class="k">Recordings today</div><div class="v">${r.totalToday}</div></div>
  <div class="card"><div class="k">Voiceprints</div><div class="v">${real.filter(x=>x.enrolled).length}<span style="font-size:16px;color:#8A93A8">/${real.length}</span></div></div>
</div>
<table><thead><tr>
 <th>DSR</th><th>Status</th><th>Today</th><th>Audio</th><th>Last upload (IST)</th><th>Ago</th><th>Voiceprint</th><th>All-time</th>
</tr></thead><tbody>${cells}</tbody></table>
<p class="foot">
 <b>Active</b> = a recording arrived in the last ${ACTIVE_MINUTES} minutes. Recordings are the live signal —
 day logs only upload when a rep <i>ends</i> their day, so they say nothing about someone mid-shift.<br>
 A rep with no recordings has either not started, has no signal, or is not recording — check with them.
</p>
</div></body></html>`;
}

createServer(async (_req: unknown, res: any) => {
  try {
    const html = page(await buildReport());
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error: ' + (e instanceof Error ? e.message : String(e)));
  }
}).listen(PORT, () => {
  console.log(`\n  Pilot monitor running →  http://localhost:${PORT}\n`);
});
