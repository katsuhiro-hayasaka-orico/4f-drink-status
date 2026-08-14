/** All D1 access lives here. */

import {
  DRINK_KEYS,
  emptyDrinkTally,
  type ActionKey,
  type DrinkKey,
  type DrinkTally,
  type EventName,
  type MoodKey,
  type Report,
  type SubjectKey,
} from '../shared/domain.js';
import { CONFIG } from '../shared/config.js';

/** Reports older than this are never sent to the client. */
export const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Hard cap on a single response, so one busy day can't balloon the payload. */
export const HISTORY_LIMIT = 200;

interface ReportRow {
  id: string;
  subject: string;
  action: string;
  user_id: string;
  user_label: string;
  created_at: number;
}

function toReport(row: ReportRow): Report {
  return {
    id: row.id,
    subject: row.subject as SubjectKey,
    action: row.action as ActionKey,
    userId: row.user_id,
    userLabel: row.user_label,
    createdAt: Number(row.created_at),
  };
}

/**
 * The last 24 hours of reports, newest first. One query feeds everything: the
 * 30-minute aggregation window, the 直近24時間の協力者 count, and the
 * 投稿の内訳 table.
 */
export async function listRecentReports(db: D1Database, now: number): Promise<Report[]> {
  const { results } = await db
    .prepare(
      `SELECT id, subject, action, user_id, user_label, created_at
         FROM reports
        WHERE created_at >= ?1
        ORDER BY created_at DESC
        LIMIT ?2`,
    )
    .bind(now - HISTORY_WINDOW_MS, HISTORY_LIMIT)
    .all<ReportRow>();
  return (results ?? []).map(toReport);
}

/**
 * 利用者A, 利用者B … 利用者Z, 利用者AA — spreadsheet-column naming, so the
 * label stays short no matter how many people the lounge has.
 */
function labelForIndex(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `利用者${out}`;
}

/**
 * The display name for a device, assigned on first post and stable thereafter.
 * Two devices registering in the same instant can end up sharing a label; that
 * is cosmetic only, since every vote is counted by `user_id`.
 */
export async function ensureUserLabel(
  db: D1Database,
  userId: string,
  now: number,
): Promise<string> {
  const existing = await db
    .prepare('SELECT label FROM users WHERE id = ?1')
    .bind(userId)
    .first<{ label: string }>();
  if (existing) return existing.label;

  const countRow = await db
    .prepare('SELECT COUNT(*) AS n FROM users')
    .first<{ n: number }>();
  const label = labelForIndex(Number(countRow?.n ?? 0));

  await db
    .prepare('INSERT OR IGNORE INTO users (id, label, created_at) VALUES (?1, ?2, ?3)')
    .bind(userId, label, now)
    .run();

  // If the INSERT lost a race, the stored label wins.
  const stored = await db
    .prepare('SELECT label FROM users WHERE id = ?1')
    .bind(userId)
    .first<{ label: string }>();
  return stored?.label ?? label;
}

/**
 * Single-row reports store their own id as the group, so undo and rate
 * limiting can treat every posting uniformly as one group.
 */
export async function insertReport(db: D1Database, report: Report): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reports (id, subject, action, user_id, user_label, created_at, group_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?1)`,
    )
    .bind(
      report.id,
      report.subject,
      report.action,
      report.userId,
      report.userLabel,
      report.createdAt,
    )
    .run();
}

/** One drink posting, fanned out into several rows under one group id. */
export async function insertReportRows(
  db: D1Database,
  rows: readonly Report[],
  groupId: string,
): Promise<void> {
  const stmt = db.prepare(
    `INSERT INTO reports (id, subject, action, user_id, user_label, created_at, group_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  );
  await db.batch(
    rows.map((r) =>
      stmt.bind(r.id, r.subject, r.action, r.userId, r.userLabel, r.createdAt, groupId),
    ),
  );
}

/**
 * Postings per device inside a window — counted as groups, not rows, so a
 * drink report that fanned out into six rows still spends one unit of the
 * rate limit. Historical NULL-group rows count as one each via COALESCE.
 */
export async function countRecentPostings(
  db: D1Database,
  userId: string,
  since: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT COALESCE(group_id, id)) AS n
         FROM reports WHERE user_id = ?1 AND created_at >= ?2`,
    )
    .bind(userId, since)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * Undo. Scoped to the caller's own report and to the undo window, so this can
 * never become a way to delete someone else's observation — or to quietly
 * rewrite history an hour later. The window gets a grace period for the
 * round-trip the client spent getting here.
 */
export async function deleteOwnRecentReport(
  db: D1Database,
  id: string,
  userId: string,
  now: number,
): Promise<boolean> {
  const cutoff = now - (CONFIG.undoWindowMs + 15_000);
  const res = await db
    .prepare('DELETE FROM reports WHERE id = ?1 AND user_id = ?2 AND created_at >= ?3')
    .bind(id, userId, cutoff)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Undo for fanned-out postings: the whole group goes, or nothing does. */
export async function deleteOwnRecentGroup(
  db: D1Database,
  groupId: string,
  userId: string,
  now: number,
): Promise<boolean> {
  const cutoff = now - (CONFIG.undoWindowMs + 15_000);
  const res = await db
    .prepare('DELETE FROM reports WHERE group_id = ?1 AND user_id = ?2 AND created_at >= ?3')
    .bind(groupId, userId, cutoff)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/**
 * All-time drink popularity: how many times each drink was reported, split
 * by outcome. Deliberately unwindowed — the recent list caps at 24h/200
 * rows, but 人気度 is the one number that should keep growing.
 */
export async function tallyDrinkReports(db: D1Database): Promise<DrinkTally> {
  const placeholders = DRINK_KEYS.map((_, i) => `?${i + 1}`).join(', ');
  const { results } = await db
    .prepare(
      `SELECT subject, action, COUNT(*) AS n
         FROM reports
        WHERE subject IN (${placeholders})
        GROUP BY subject, action`,
    )
    .bind(...DRINK_KEYS)
    .all<{ subject: string; action: string; n: number }>();

  const tally = emptyDrinkTally();
  for (const row of results ?? []) {
    const bucket = tally[row.subject as DrinkKey];
    if (!bucket) continue;
    if (row.action === 'made') bucket.made = Number(row.n);
    else if (row.action === 'failed') bucket.failed = Number(row.n);
  }
  return tally;
}

/* -------------------------------------------------------------- feedback -- */

/**
 * The only feedback query the Worker runs: how many of each mood. Bodies
 * deliberately have no read path here — the site is public, and free text
 * is where personal or confidential details end up. Admins read them with
 * wrangler d1 execute, never over the site's API.
 */
export async function tallyFeedback(db: D1Database): Promise<Record<MoodKey, number>> {
  const { results } = await db
    .prepare('SELECT mood, COUNT(*) AS n FROM feedback GROUP BY mood')
    .all<{ mood: string; n: number }>();
  const tally: Record<MoodKey, number> = { happy: 0, neutral: 0, sad: 0 };
  for (const row of results ?? []) {
    if (row.mood in tally) tally[row.mood as MoodKey] = Number(row.n);
  }
  return tally;
}

export interface FeedbackInsert {
  id: string;
  mood: MoodKey;
  body: string;
  userId: string;
  userLabel: string;
  createdAt: number;
}

export async function insertFeedback(db: D1Database, entry: FeedbackInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO feedback (id, mood, body, user_id, user_label, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(entry.id, entry.mood, entry.body, entry.userId, entry.userLabel, entry.createdAt)
    .run();
}

/** Feeds the feedback rate limit, same shape as the reports one. */
export async function countRecentFeedback(
  db: D1Database,
  userId: string,
  since: number,
): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM feedback WHERE user_id = ?1 AND created_at >= ?2')
    .bind(userId, since)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}


/* ---------------------------------------------------------------- events -- */

export async function insertEvent(
  db: D1Database,
  name: EventName,
  value: number | null,
  userId: string,
  now: number,
): Promise<void> {
  await db
    .prepare('INSERT INTO events (id, name, value, user_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(crypto.randomUUID(), name, value, userId, now)
    .run();
}

export async function countRecentEvents(
  db: D1Database,
  userId: string,
  since: number,
): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM events WHERE user_id = ?1 AND created_at >= ?2')
    .bind(userId, since)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

