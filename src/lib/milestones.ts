/**
 * The 10投稿ごとのお礼: which milestone, if any, this device has not been
 * thanked for yet. Pure, so vitest can pin the branches; the toast itself is
 * raised by useDrinkStatus when the undo window closes.
 *
 * Stored as `<userId>:<count>` rather than a bare number, for two reasons:
 * a device whose cookie rotated is a different contributor starting from zero
 * and must not inherit a stranger's ceiling, and a shared browser must not let
 * one identity's progress silence another's.
 *
 * Same localStorage conventions as the theme, a2hs and feedback keys: a bare
 * string, every access in try/catch for private mode, and the stored value
 * validated on read rather than trusted.
 */

import { MILESTONE_EVERY } from '../../shared/contributors.js';

const STORAGE_KEY = 'drink-status-celebrated';

/**
 * The milestone to celebrate now, or null.
 *
 * The largest multiple of ten at or below the current total — not
 * `postings - postings % 10 === 0` — so a device that was away while its count
 * passed 20 and 30 gets one thank-you for where it actually is rather than
 * three in a row, or none.
 */
export function nextCelebration(postings: number, lastCelebrated: number): number | null {
  if (!Number.isFinite(postings) || postings < MILESTONE_EVERY) return null;
  const milestone = Math.floor(postings / MILESTONE_EVERY) * MILESTONE_EVERY;
  return milestone > lastCelebrated ? milestone : null;
}

/** `<userId>:<count>` for this identity, or 0 when it is anyone else's. */
export function parseCelebrated(raw: string | null, me: string): number {
  if (!raw || !me) return 0;
  // Split on the LAST colon: a user id may contain one, a decimal count may not.
  const at = raw.lastIndexOf(':');
  if (at < 0 || raw.slice(0, at) !== me) return 0;
  const n = Number(raw.slice(at + 1));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Unreadable storage reads as "already celebrated everything": a device that
 * cannot remember would otherwise be congratulated on its tenth posting once
 * per page load. Quietly missing the toast is the kinder failure.
 */
export function readCelebrated(me: string): number {
  try {
    return parseCelebrated(localStorage.getItem(STORAGE_KEY), me);
  } catch {
    return Infinity;
  }
}

export function markCelebrated(me: string, milestone: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, `${me}:${milestone}`);
  } catch {
    /* the thank-you may repeat on the next milestone; nothing worse */
  }
}
