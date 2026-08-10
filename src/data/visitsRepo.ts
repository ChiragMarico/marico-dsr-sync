/** Per-visit records backing the Home counters and Visit History screen. */
import { getDb } from '../upload/db';

export interface VisitRow {
  visit_id: string;
  dsr_id: string;
  date: string;
  outlet_name: string;
  enter_ts: string;
  exit_ts: string | null;
  trigger: string;
  finalized: number;
}

export async function insertVisit(v: {
  visit_id: string;
  dsr_id: string;
  date: string;
  outlet_name: string;
  enter_ts: string;
  trigger: 'geofence' | 'manual';
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO visits (visit_id, dsr_id, date, outlet_name, enter_ts, trigger, finalized) VALUES (?, ?, ?, ?, ?, ?, 0)',
    v.visit_id,
    v.dsr_id,
    v.date,
    v.outlet_name,
    v.enter_ts,
    v.trigger,
  );
}

export async function finalizeVisit(visitId: string, exitTs: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE visits SET exit_ts = ?, finalized = 1 WHERE visit_id = ?',
    exitTs,
    visitId,
  );
}

export async function todayVisits(dsrId: string, date: string): Promise<VisitRow[]> {
  const db = await getDb();
  return db.getAllAsync<VisitRow>(
    'SELECT * FROM visits WHERE dsr_id = ? AND date = ? ORDER BY enter_ts DESC',
    dsrId,
    date,
  );
}

/** Which of today's visits still have items in the upload queue. */
export async function pendingVisitIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ visit_id: string }>(
    "SELECT DISTINCT visit_id FROM queue WHERE status != 'done'",
  );
  return new Set(rows.map((r) => r.visit_id));
}
