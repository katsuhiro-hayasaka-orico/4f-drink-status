/**
 * Ordering and date formatting for the ご意見箱's 「ご意見から改善した機能」 list.
 *
 * The list itself — the paraphrased voices and what shipped — stays in
 * `src/components/FeedbackBox.tsx`, where it reads as the editorial copy it is.
 * Only the arithmetic lives here, so it can be tested: the component cannot be,
 * and getting the order wrong is exactly the kind of thing that goes unnoticed
 * until the list is long.
 */

export interface ShippedItem {
  /** Ship date as `YYYY-MM-DD`. Stored sortable, formatted for display. */
  when: string;
  /** A PARAPHRASE written by the admin — never the submitted text. */
  voice: string;
  change: string;
}

/**
 * `2026-09-04` → `2026年9月4日`.
 *
 * Split rather than parsed: `new Date('2026-01-01')` is read as UTC midnight,
 * so anywhere west of Japan it renders as the day before. These are calendar
 * dates someone typed, not instants, and they should read back exactly as
 * typed. Zero padding is dropped to match how the dates have always shown.
 */
export function formatShippedDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
}

/**
 * Newest first, without touching the caller's array.
 *
 * Sorting the ISO strings works where sorting the display strings does not:
 * `'2026年10月1日' < '2026年9月4日'` because `1` sorts before `9`, which would
 * quietly bury October under September the first time the list crossed into
 * double-digit months.
 *
 * The sort is stable, so entries sharing a date keep the order they were
 * written in — which is what you want when two things shipped the same day.
 */
export function byNewestFirst<T extends ShippedItem>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0));
}
