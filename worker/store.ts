/** All D1 access lives here. */

import type { ActionKey, Report, SubjectKey } from '../shared/domain.js';
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
