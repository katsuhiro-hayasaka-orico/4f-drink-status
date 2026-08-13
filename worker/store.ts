/** All D1 access lives here. */

import type {
  ActionKey,
  EventName,
  FeedbackEntry,
  MoodKey,
  Report,
  SubjectKey,
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

export async function insertReport(db: D1Database, report: Report): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reports (id, subject, action, user_id, user_label, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
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

/* -------------------------------------------------------------- feedback -- */

interface FeedbackRow {
  id: string;
  mood: string;
  body: string;
  user_label: string;
  created_at: number;
  updated_at: number | null;
  likes: number;
  liked_by_me: number;
  mine: number;
}

/**
 * The newest feedback entries, with like counts and the two per-requester
 * booleans computed in SQL. The public list never carries user ids — whether
 * an entry is the caller's own, or already liked by them, leaves the database
 * as 0/1 and nothing more.
 */
export async function listFeedback(
  db: D1Database,
  userId: string,
): Promise<FeedbackEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT f.id, f.mood, f.body, f.user_label, f.created_at, f.updated_at,
              (SELECT COUNT(*) FROM feedback_likes l
                WHERE l.feedback_id = f.id) AS likes,
              EXISTS(SELECT 1 FROM feedback_likes l
                      WHERE l.feedback_id = f.id AND l.user_id = ?1) AS liked_by_me,
              (f.user_id = ?1) AS mine
         FROM feedback f
        ORDER BY f.created_at DESC
        LIMIT ?2`,
    )
    .bind(userId, CONFIG.feedbackListLimit)
    .all<FeedbackRow>();
  return (results ?? []).map((row) => ({
    id: row.id,
    mood: row.mood as MoodKey,
    body: row.body,
    userLabel: row.user_label,
    createdAt: Number(row.created_at),
    editedAt: row.updated_at === null ? null : Number(row.updated_at),
    likes: Number(row.likes),
    likedByMe: Boolean(row.liked_by_me),
    mine: Boolean(row.mine),
  }));
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

/**
 * Edit your own entry. The user_id in the WHERE clause is the whole security
 * model: someone else's id simply matches no row, indistinguishable from an
 * entry that never existed. Unlike report undo there is no time window —
 * feedback is a standing opinion, not a perishable observation.
 */
export async function updateOwnFeedback(
  db: D1Database,
  id: string,
  userId: string,
  mood: MoodKey,
  body: string,
  now: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      'UPDATE feedback SET mood = ?1, body = ?2, updated_at = ?3 WHERE id = ?4 AND user_id = ?5',
    )
    .bind(mood, body, now, id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Delete your own entry, taking its likes with it. */
export async function deleteOwnFeedback(
  db: D1Database,
  id: string,
  userId: string,
): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM feedback WHERE id = ?1 AND user_id = ?2')
    .bind(id, userId)
    .run();
  if ((res.meta?.changes ?? 0) === 0) return false;
  await db.prepare('DELETE FROM feedback_likes WHERE feedback_id = ?1').bind(id).run();
  return true;
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

/**
 * One tap likes, a second tap takes it back. Returns false when the target
 * entry doesn't exist (deleted between render and click, or a made-up id).
 * The composite primary key makes the like idempotent even under a race.
 */
export async function toggleFeedbackLike(
  db: D1Database,
  feedbackId: string,
  userId: string,
  now: number,
): Promise<boolean> {
  const exists = await db
    .prepare('SELECT 1 AS one FROM feedback WHERE id = ?1')
    .bind(feedbackId)
    .first<{ one: number }>();
  if (!exists) return false;

  const removed = await db
    .prepare('DELETE FROM feedback_likes WHERE feedback_id = ?1 AND user_id = ?2')
    .bind(feedbackId, userId)
    .run();
  if ((removed.meta?.changes ?? 0) === 0) {
    await db
      .prepare(
        'INSERT OR IGNORE INTO feedback_likes (feedback_id, user_id, created_at) VALUES (?1, ?2, ?3)',
      )
      .bind(feedbackId, userId, now)
      .run();
  }
  return true;
}
