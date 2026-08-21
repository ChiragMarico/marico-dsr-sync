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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execFile } = require('child_process') as typeof import('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { writeFileSync, readFileSync, unlinkSync } = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const os = require('os') as typeof import('os');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path') as typeof import('path');

/**
 * Transcode to MP3 so the browser can actually play it.
 *
 * Browsers have no AMR decoder, and the pilot's early recordings are AMR-NB —
 * so <audio> loaded them, failed to decode, and sat at 0:00/0:00 looking like
 * the file was missing. Converting server-side makes every recording playable
 * regardless of what it was captured as. Returns null if ffmpeg is unavailable,
 * in which case we fall back to serving the original bytes.
 */
function toMp3(input: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const tmpIn = path.join(os.tmpdir(), `sync-${Date.now()}-${Math.random().toString(36).slice(2)}.m4a`);
    const tmpOut = tmpIn.replace(/\.m4a$/, '.mp3');
    try {
      writeFileSync(tmpIn, input);
    } catch {
      resolve(null);
      return;
    }
    execFile(
      'ffmpeg',
      ['-v', 'error', '-y', '-i', tmpIn, '-ac', '1', '-b:a', '96k', tmpOut],
      (err: unknown) => {
        let out: Buffer | null = null;
        if (!err) {
          try {
            out = readFileSync(tmpOut);
          } catch {
            out = null;
          }
        }
        try { unlinkSync(tmpIn); } catch { /* noop */ }
        try { unlinkSync(tmpOut); } catch { /* noop */ }
        resolve(out);
      },
    );
  });
}
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

/**
 * Visit duration comes from the manifest the app writes next to the audio.
 * Reading it from the file itself would mean downloading every clip; the
 * manifest is a couple of KB and already carries total_duration_s.
 * Cached because manifests never change once written.
 */
const durationCache = new Map<string, number | null>();
/**
 * What the app's own watchdog observed for each visit. Far more reliable than
 * inferring from the audio: the app knows whether the microphone ever produced
 * a signal, and whether it was foregrounded when Android decided.
 */
interface MicHealth {
  peakDb: number;
  silentSeconds: number;
  wasSilent: boolean;
  startedInState: string;
  silentInState: string | null;
}
const micCache = new Map<string, MicHealth | null>();

async function fetchDurations(manifestKeys: string[]): Promise<void> {
  const missing = manifestKeys.filter((k) => !durationCache.has(k));
  await Promise.all(
    missing.map(async (k) => {
      try {
        const r = await fetch(signed('GET', k));
        if (!r.ok) {
          durationCache.set(k, null);
          return;
        }
        const j = (await r.json()) as { total_duration_s?: number; mic_health?: MicHealth };
        durationCache.set(k, typeof j.total_duration_s === 'number' ? j.total_duration_s : null);
        micCache.set(k, j.mic_health ?? null);
      } catch {
        durationCache.set(k, null);
        micCache.set(k, null);
      }
    }),
  );
}

/** Seconds → m:ss. */
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const IST = (iso: string) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }).slice(-8) : '—';
const minsAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;

/**
 * Read the real codec/sample-rate out of an .m4a by parsing its MP4 boxes.
 *
 * Exists because the app once silently recorded 8 kHz AMR for a full pilot day
 * while the config asked for 48 kHz AAC — Android had fallen back to its
 * default encoder. Nothing in the app, the types, or the tests could see that;
 * only the bytes on disk could. So the monitor checks the bytes.
 */
function probeAudio(buf: Buffer): { codec: string; sampleRate: number } | null {
  // Walk to the sample-description box (stsd) and read the entry that follows.
  const idx = buf.indexOf('stsd');
  if (idx < 0) return null;
  // idx points at the 4-char box TYPE, so contents start at idx+4:
  //   4 version/flags + 4 entry count  →  first sample entry at idx+12.
  // Within the entry: 4 size, 4 format, 6 reserved, 2 data-ref,
  //   8 version/revision/vendor, 2 channels, 2 sample size,
  //   2 pre-defined, 2 reserved, then 4 bytes sample rate as 16.16 fixed
  //   point — the integer part is the top 16 bits, at entry+32.
  const entry = idx + 12;
  if (entry + 36 > buf.length) return null;
  const format = buf.toString('latin1', entry + 4, entry + 8);
  const sampleRate = buf.readUInt16BE(entry + 32);
  const codec =
    format === 'mp4a' ? 'aac' :
    format === 'samr' ? 'AMR-NB' :
    format === 'sawb' ? 'AMR-WB' : format;
  return { codec, sampleRate };
}

async function buildReport(filterDsr?: string) {
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

  // Recent recordings, newest first. Key shape:
  //   marico-dsr/recordings/{dsr}/{date}/{outlet}/{visit}/chunk_001.m4a
  const clips = audio
    .filter((a) => !filterDsr || a.key.split('/')[2] === filterDsr)
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, 60)
    .map((a) => {
      const p = a.key.split('/');
      return {
        key: a.key,
        manifestKey: a.key.replace(/[^/]+$/, 'manifest.json'),
        dsr: p[2] ?? '?',
        date: p[3] ?? '',
        outlet: p[4] ?? '?',
        sizeKB: Math.max(1, Math.round(a.size / 1024)),
        modified: a.modified,
      };
    });

  await fetchDurations(clips.map((c) => c.manifestKey));

  const dsrList = [...new Set(audio.map((a) => a.key.split('/')[2]))].sort();

  // Probe the most recent recording — enough to catch a format regression
  // without downloading everything.
  let format: { codec: string; sampleRate: number; when: string } | null = null;
  const newest = audio.slice().sort((a, b) => b.modified.localeCompare(a.modified))[0];
  if (newest) {
    // moov (which holds the format) can sit at either end of an MP4 depending
    // on the encoder, so try the tail first and fall back to the head rather
    // than reporting "unknown" for larger files.
    const tryRange = async (range: string) => {
      try {
        const r = await fetch(signed('GET', newest.key), { headers: { Range: range } });
        if (!r.ok && r.status !== 206) return null;
        return probeAudio(Buffer.from(await r.arrayBuffer()));
      } catch {
        return null;
      }
    };
    const from = Math.max(0, newest.size - 262144);
    const p = (await tryRange(`bytes=${from}-`)) ?? (await tryRange('bytes=0-262143'));
    if (p) format = { ...p, when: newest.modified };
  }

  return { rows, todayIST, clips, dsrList, filterDsr, format, totalToday: rows.reduce((s, r) => s + r.today, 0) };
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
<title>Sync pilot monitor</title>
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
 .h2{font-size:18px;margin:34px 0 12px;letter-spacing:-.015em}
 .cnt{font-size:12px;color:#8A93A8;font-weight:400;margin-left:8px}
 .filters{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}
 .chip{font-size:13px;padding:6px 12px;border-radius:100px;border:1px solid #E2E8F2;background:#fff;color:#5A6478;text-decoration:none}
 .chip.on{background:#1C5AA8;border-color:#1C5AA8;color:#fff;font-weight:600}
 .clips{display:grid;gap:9px}
 .clip{background:#fff;border:1px solid #E2E8F2;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
 .cmeta{flex:1;min-width:210px}
 .cout{color:#5A6478;font-size:13px;margin-left:8px}
 .ctime{display:block;color:#8A93A8;font-size:12px;margin-top:3px;font-variant-numeric:tabular-nums}
 .clip audio{height:36px}
 .dl{font-size:12px;color:#1C5AA8;text-decoration:none}
 .badge{font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;margin-left:6px}
 .badge.good{background:rgba(23,128,61,.12);color:#17803D}
 .badge.bad{background:rgba(196,54,43,.12);color:#C4362B}
 .state{font-size:11px;color:#8A93A8;margin-left:4px}
</style></head><body><div class="wrap">
<h1>Sync pilot monitor</h1>
<p class="sub">${r.todayIST} · refreshed ${new Date().toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})} IST · <a href="javascript:location.reload()" style="color:#1C5AA8">refresh</a></p>
<div class="cards">
  <div class="card"><div class="k">Active now</div><div class="v" style="color:#17803D">${active}</div></div>
  <div class="card"><div class="k">Reps seen</div><div class="v">${real.length}</div></div>
  <div class="card"><div class="k">Recordings today</div><div class="v">${r.totalToday}</div></div>
  <div class="card"><div class="k">Mic health today</div>${(() => {
    const today = r.clips.filter((c) => c.date === r.todayIST);
    const known = today.map((c) => micCache.get(c.manifestKey)).filter((m): m is MicHealth => !!m);
    if (!known.length) {
      return `<div class="v" style="font-size:19px;color:#8A93A8">—</div>
        <div style="font-size:11px;color:#8A93A8;margin-top:4px">awaiting v8.2 builds</div>`;
    }
    const bad = known.filter((m) => m.wasSilent).length;
    const pct = Math.round(((known.length - bad) / known.length) * 100);
    return `<div class="v" style="font-size:24px;color:${pct >= 90 ? '#17803D' : pct >= 60 ? '#A96908' : '#C4362B'}">${pct}%</div>
      <div style="font-size:11px;color:#8A93A8;margin-top:4px">${bad} of ${known.length} silent</div>`;
  })()}</div>
  <div class="card"><div class="k">Recorded today</div><div class="v" style="font-size:24px">${(() => {
    const secs = r.clips
      .filter((c) => c.date === r.todayIST)
      .reduce((t, c) => t + (durationCache.get(c.manifestKey) ?? 0), 0);
    return secs ? `${Math.floor(secs / 60)}<span style="font-size:15px;color:#8A93A8">m</span>` : '—';
  })()}</div></div>
  <div class="card"><div class="k">Audio format</div><div class="v" style="font-size:19px;color:${
    r.format ? (r.format.codec === 'aac' && r.format.sampleRate >= 44100 ? '#17803D' : '#C4362B') : '#8A93A8'
  }">${r.format ? `${r.format.codec} ${(r.format.sampleRate / 1000).toFixed(1)}kHz` : '—'}</div>
  <div style="font-size:11px;color:#8A93A8;margin-top:4px">${
    r.format
      ? (r.format.codec === 'aac' && r.format.sampleRate >= 44100 ? 'newest recording OK' : '⚠ NOT high quality')
      : 'no recordings'
  }</div></div>
  <div class="card"><div class="k">Voiceprints</div><div class="v">${real.filter(x=>x.enrolled).length}<span style="font-size:16px;color:#8A93A8">/${real.length}</span></div></div>
</div>
<table><thead><tr>
 <th>DSR</th><th>Status</th><th>Today</th><th>Audio</th><th>Last upload (IST)</th><th>Ago</th><th>Voiceprint</th><th>All-time</th>
</tr></thead><tbody>${cells}</tbody></table>
<h2 class="h2">Recordings ${r.filterDsr ? '· ' + r.filterDsr : '· all reps'}
  <span class="cnt">${r.clips.length} most recent</span></h2>
<div class="filters">
  <a class="chip ${!r.filterDsr ? 'on' : ''}" href="/">All</a>
  ${r.dsrList.map((d) => `<a class="chip ${r.filterDsr === d ? 'on' : ''}" href="/?dsr=${encodeURIComponent(d)}">${d}</a>`).join('')}
</div>
<div class="clips">
${r.clips.map((c) => `
  <div class="clip">
    <div class="cmeta">
      <b>${c.dsr}</b>
      <span class="cout">${c.outlet}</span>${(() => {
        const m = micCache.get(c.manifestKey);
        if (!m) return '';
        // startedInState is the datum that was missing while we were guessing:
        // whether the app was foregrounded when Android granted (or refused) the mic.
        const state = `<span class="state">${m.startedInState}</span>`;
        return m.wasSilent
          ? ` <span class="badge bad">SILENT · peak ${Math.round(m.peakDb)}dB</span> ${state}`
          : ` <span class="badge good">audio ${Math.round(m.peakDb)}dB</span> ${state}`;
      })()}
      <span class="ctime">${(() => {
        const d = durationCache.get(c.manifestKey);
        // Under ~5s usually means the geofence fired and the rep moved off
        // again — worth seeing at a glance rather than hunting for.
        const dur = d == null ? '—' : `${mmss(d)}${d < 5 ? ' ⚠' : ''}`;
        return `<b style="color:${d != null && d < 5 ? '#C4362B' : '#5A6478'}">${dur}</b>`;
      })()} · ${IST(c.modified)} IST · ${c.date} · ${c.sizeKB} KB</span>
    </div>
    <audio controls preload="metadata" src="/play?key=${encodeURIComponent(c.key)}"></audio>
    <a class="dl" href="/download?key=${encodeURIComponent(c.key)}">download</a>
  </div>`).join('')}
${r.clips.length === 0 ? '<p class="foot">No recordings yet.</p>' : ''}
</div>

<p class="foot">
 <b>Active</b> = a recording arrived in the last ${ACTIVE_MINUTES} minutes. Recordings are the live signal —
 day logs only upload when a rep <i>ends</i> their day, so they say nothing about someone mid-shift.<br>
 A rep with no recordings has either not started, has no signal, or is not recording — check with them.
</p>
</div></body></html>`;
}

createServer(async (req: any, res: any) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    // Stream the audio through this server rather than redirecting to S3.
    // A redirect works in curl but browsers refuse to play media across an
    // origin change, so <audio> silently did nothing. Proxying keeps it
    // same-origin. Clips are small (tens to a few hundred KB), so buffering
    // them is fine and it also avoids signed URLs expiring in an open tab.
    if (url.pathname === '/play') {
      const key = url.searchParams.get('key');
      if (!key) {
        res.writeHead(400).end('missing key');
        return;
      }
      const upstream = await fetch(signed('GET', key));
      if (!upstream.ok) {
        res.writeHead(upstream.status).end('upstream ' + upstream.status);
        return;
      }
      const original = Buffer.from(await upstream.arrayBuffer());
      const mp3 = await toMp3(original);
      const body = mp3 ?? original;
      res.writeHead(200, {
        'Content-Type': mp3 ? 'audio/mpeg' : 'audio/mp4',
        'Content-Length': String(body.length),
        'Accept-Ranges': 'none',
        'Cache-Control': 'no-store',
      });
      res.end(body);
      return;
    }

    // Download the original file rather than streaming it.
    if (url.pathname === '/download') {
      const key = url.searchParams.get('key');
      if (!key) {
        res.writeHead(400).end('missing key');
        return;
      }
      const upstream = await fetch(signed('GET', key));
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': 'audio/mp4',
        'Content-Length': String(buf.length),
        'Content-Disposition': `attachment; filename="${key.split('/').slice(-3).join('_')}"`,
      });
      res.end(buf);
      return;
    }

    const html = page(await buildReport(url.searchParams.get('dsr') ?? undefined));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error: ' + (e instanceof Error ? e.message : String(e)));
  }
}).listen(PORT, () => {
  console.log(`\n  Pilot monitor running →  http://localhost:${PORT}\n`);
});
