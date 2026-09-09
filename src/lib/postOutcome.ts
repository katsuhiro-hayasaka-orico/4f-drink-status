import { ApiError } from './api.js';

/**
 * What a posting call reports back to whoever asked for it.
 *
 *   ok        the server confirmed the write
 *   rejected  the server answered and said no — nothing was saved
 *   unknown   the request never got an answer: the server may or may not
 *             have saved it, and nobody on this side can tell
 *   skipped   nothing was sent, because another posting was still in flight
 *
 * The form needs rejected and unknown kept apart because the honest advice
 * differs — retry the first, check the board before retrying the second.
 * It is a return value rather than a throw on purpose: the queue panel posts
 * without looking at the result, and a caller that forgets to look must not
 * turn into an unhandled rejection. (useFeedback throws instead; its only
 * caller is a dialog that always catches.)
 */
export type PostOutcome = 'ok' | 'rejected' | 'unknown' | 'skipped';

/**
 * ApiError(0) is fetch() itself failing — no response came back, so there is
 * no verdict. Anything with a status is the server speaking.
 */
export function classifyPostError(err: unknown): 'rejected' | 'unknown' {
  if (err instanceof ApiError && err.status >= 400) return 'rejected';
  return 'unknown';
}

/**
 * The line the form keeps showing until the person acts on it. The toast
 * already carries the server's own reason and fades; this one stays, and says
 * what to do next.
 */
export function outcomeMessage(outcome: 'rejected' | 'unknown'): string {
  return outcome === 'rejected'
    ? '投稿できませんでした。内容は残してあるので、もう一度送れます'
    : '送信結果を確認できませんでした。「投稿の内訳」に自分の投稿があるか確かめてから、必要ならもう一度送ってください';
}
