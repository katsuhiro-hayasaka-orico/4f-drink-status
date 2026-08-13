/**
 * Which reports deserve a notification.
 *
 * Pure on purpose: the browser half (permission, the Notification object,
 * focus checks) lives in the useNotifications hook, and everything that can
 * be wrong in an interesting way — what counts as "new", whose posts count,
 * how the message reads — lives here where vitest can reach it.
 *
 * Novelty is a high-water mark over server timestamps, not a diff of ids:
 * ids come and go (undo deletes them, the 200-row window slides), but
 * `createdAt` is server-issued and monotonic enough that "newer than the
 * newest thing I've already seen" is exactly the question being asked.
 */

import { isDrinkKey, reportValueQuote, subjectLabel, type Report } from '../../shared/domain.js';

export interface WatermarkResult {
  watermark: number;
  /** Foreign reports newer than the previous watermark, newest first. */
  fresh: Report[];
}

/**
 * Advance the high-water mark and collect what's genuinely new.
 *
 * A `null` watermark means "first sight of real data": everything present is
 * baseline, nothing is news. That rule is what keeps a page load from
 * dumping the seed data into the notification tray.
 *
 * Own posts never count — the poster watched themselves tap the button —
 * and optimistic `pending-` rows are skipped outright, since they are a
 * local guess rather than something the server has confirmed.
 */
export function advanceWatermark(
  reports: readonly Report[],
  me: string,
  watermark: number | null,
): WatermarkResult {
  // Optimistic rows never advance the mark: their createdAt is the client's
  // guess at server time, not a server timestamp. Letting a guess push the
  // high-water mark forward can mask a colleague's not-yet-fetched post that
  // landed just before it — permanently, since the mark never rolls back.
  const maxAt = reports.reduce(
    (max, r) => (r.id.startsWith('pending-') ? max : Math.max(max, r.createdAt)),
    0,
  );

  if (watermark === null) return { watermark: maxAt, fresh: [] };

  const fresh = reports
    .filter((r) => r.createdAt > watermark && r.userId !== me && !r.id.startsWith('pending-'))
    .sort((a, b) => b.createdAt - a.createdAt);

  // max() with the old mark, so a shrinking list (undo) never rolls it back.
  return { watermark: Math.max(watermark, maxAt), fresh };
}

/** 「カフェモカ「作れた」」 — the subject and what was said about it. */
function reportLabel(r: Report): string {
  return `${subjectLabel(r.subject)}「${reportValueQuote(r.subject, r.action)}」`;
}

/**
 * A drink report fans out into several rows sharing one author and instant.
 * To a reader that is ONE posting, and its drink row is the one worth
 * quoting — the material votes are its derivation, not separate news.
 */
export function collapsePostings(fresh: readonly Report[]): Report[] {
  const byPosting = new Map<string, Report>();
  for (const r of fresh) {
    const key = `${r.userId}:${r.createdAt}`;
    const current = byPosting.get(key);
    if (!current || (isDrinkKey(r.subject) && !isDrinkKey(current.subject))) {
      byPosting.set(key, r);
    }
  }
  return [...byPosting.values()];
}

/**
 * One body per poll cycle, however many reports arrived in it. A burst of
 * posts is one piece of news — the machine's state changed — not five.
 */
export function buildNotificationBody(fresh: readonly Report[]): string {
  const postings = collapsePostings(fresh);
  const newest = postings[0];
  if (postings.length === 1) {
    return `${newest.userLabel}さんが ${reportLabel(newest)} と投稿しました`;
  }
  return `新しい投稿が${postings.length}件あります。最新: ${reportLabel(newest)}`;
}
