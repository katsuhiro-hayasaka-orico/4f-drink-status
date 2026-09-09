/**
 * What the board should say about its own data, before it says anything
 * about the machine. Four states the UI used to fold into two:
 *
 *   loading      first fetch still out — nothing is known yet, not even
 *                whether anyone posted
 *   failedFirst  never reached the server — there is no "previous data"
 *                to fall back on, whatever the old banner claimed
 *   failedLater  a later fetch failed — the board is showing what it got
 *                at `fetchedAt`, and says when that was
 *   ok           nothing to say
 *
 * Pure so it can be pinned in a test; the caller supplies the clock format.
 */
export interface LoadStatusInput {
  loading: boolean;
  loadError: string | null;
  /** Server time of the last adopted snapshot; null until one lands. */
  fetchedAt: number | null;
}

export interface LoadStatus {
  kind: 'loading' | 'failedFirst' | 'failedLater' | 'ok';
  /** The line to show, or null for nothing. */
  text: string | null;
  /** Whether a 再試行 button belongs next to it. */
  retry: boolean;
}

export function loadStatus(
  { loading, loadError, fetchedAt }: LoadStatusInput,
  formatTime: (at: number) => string,
): LoadStatus {
  if (fetchedAt === null) {
    if (loadError) {
      return { kind: 'failedFirst', text: `状況を取得できませんでした（${loadError}）`, retry: true };
    }
    if (loading) return { kind: 'loading', text: '最新の状況を確認しています', retry: false };
  }
  if (loadError && fetchedAt !== null) {
    return {
      kind: 'failedLater',
      text: `更新できませんでした（${loadError}）。${formatTime(fetchedAt)} に取得した情報を表示しています`,
      retry: true,
    };
  }
  return { kind: 'ok', text: null, retry: false };
}
