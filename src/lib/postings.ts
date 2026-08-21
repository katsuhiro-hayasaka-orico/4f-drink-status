import { isDrinkKey, type Report } from '../../shared/domain.js';

/**
 * A drink report fans out into several rows sharing one author and instant.
 * To a reader that is ONE posting, and its drink row is the one worth
 * showing — the material votes are its derivation, not separate news.
 *
 * (This used to live beside the in-tab notifier; the notifier moved to Web
 * Push, where the server collapses at send time, but the 投稿の内訳 table
 * still folds its rows with this.)
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
