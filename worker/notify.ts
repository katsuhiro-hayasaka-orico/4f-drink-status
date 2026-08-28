/**
 * The posting→push pipeline. A successful POST schedules this through
 * `ctx.waitUntil`, so the poster's response never waits on push delivery.
 *
 * The send is deliberately late: it sleeps out the undo window (plus the
 * server's round-trip grace) and then re-checks that the posting still
 * exists. A notification is the one thing undo can't take back, so nothing
 * goes out until taking it back is no longer possible. waitUntil allows 30
 * seconds past the response — the ~21-second sleep leaves the rest for the
 * sends themselves.
 */

import { CONFIG } from '../shared/config.js';
import { isDrinkKey, reportValueQuote, subjectLabel, type Report } from '../shared/domain.js';
import type { Env } from './env.js';
import { sendPush, type VapidJwk } from './push.js';
import {
  deletePushEndpoints,
  groupExists,
  listPushSubscriptionsExcept,
  type PushSubscriptionRow,
} from './store.js';

/** One second past the undo DELETE's own cutoff, so the race has a loser. */
const SEND_DELAY_MS = CONFIG.undoWindowMs + 16_000;

/**
 * Free-plan Workers allow 50 subrequests per invocation, and every push is
 * one fetch on top of the handler's own D1 traffic. A 4F lounge is nowhere
 * near this; if it ever is, the overflow is logged instead of silently cut.
 */
export const MAX_PUSH_PER_POST = 30;

/** VAPID `sub` when the operator hasn't set one — the project page, a valid operator URI. */
const DEFAULT_VAPID_SUBJECT = 'https://github.com/katsuhiro-hayasaka-orico/4f-drink-status';

export interface DeliveryResult {
  attempted: number;
  delivered: number;
  /** Subscriptions the push service declared dead — already deleted here. */
  gone: number;
}

/**
 * Deliver one payload to a list of subscriptions and forget the ones the
 * push service says are gone. Shared by the posting pipeline and the admin
 * announce endpoint.
 */
export async function deliverToAll(
  env: Env,
  jwk: VapidJwk,
  subs: readonly PushSubscriptionRow[],
  payload: Record<string, unknown>,
): Promise<DeliveryResult> {
  if (subs.length === 0) return { attempted: 0, delivered: 0, gone: 0 };
  const subject = env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;
  const results = await Promise.all(
    subs.map((s) =>
      sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload, jwk, subject),
    ),
  );
  const goneEndpoints = subs.filter((_, i) => results[i] === 'gone').map((s) => s.endpoint);
  await deletePushEndpoints(env.DB, goneEndpoints);
  return {
    attempted: subs.length,
    delivered: results.filter((r) => r === 'ok').length,
    gone: goneEndpoints.length,
  };
}

/** The secret parsed and sanity-checked; null means push is not configured. */
export function parseVapidJwk(env: Env): VapidJwk | null {
  if (!env.VAPID_PRIVATE_JWK) return null;
  try {
    const jwk = JSON.parse(env.VAPID_PRIVATE_JWK) as VapidJwk;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y || !jwk.d) return null;
    return jwk;
  } catch {
    return null;
  }
}

/**
 * 「利用者Bさんが カフェモカ「作れた」と投稿しました」 — one body per
 * posting. A drink posting fans out into several rows; its drink row is the
 * news, the material votes are derivation.
 */
export function postingNotificationBody(rows: readonly Report[]): string | null {
  const star = rows.find((r) => isDrinkKey(r.subject)) ?? rows[0];
  if (!star) return null;
  return `${star.userLabel}さんが ${subjectLabel(star.subject)}「${reportValueQuote(star.subject, star.action)}」と投稿しました`;
}

/**
 * Sleep past the undo window, confirm the posting survived, deliver to every
 * subscription except the poster's own devices, and forget subscriptions the
 * push service says are gone.
 */
export async function notifyAfterUndoWindow(
  env: Env,
  groupId: string,
  posterUserId: string,
  body: string | null,
): Promise<void> {
  const jwk = parseVapidJwk(env);
  if (!jwk || !body) return;

  await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
  if (!(await groupExists(env.DB, groupId))) return;

  const subs = await listPushSubscriptionsExcept(env.DB, posterUserId, MAX_PUSH_PER_POST + 1);
  if (subs.length > MAX_PUSH_PER_POST) {
    console.warn(`[push] ${subs.length - MAX_PUSH_PER_POST}+ subscriptions beyond the per-post cap were skipped`);
    subs.length = MAX_PUSH_PER_POST;
  }
  await deliverToAll(env, jwk, subs, {
    title: '4Fドリンク速報',
    body,
    tag: 'drink-status-reports',
  });
}
