/**
 * 4Fドリンク速報 — Cloudflare Worker API.
 *
 * The machine board, over one D1 table:
 *   GET    /api/reports      the last 24h of observations
 *   POST   /api/reports      post one ({ subject, action })
 *   DELETE /api/reports/:id  take your own back, inside the undo window
 *
 * And ご意見箱 — collected publicly, read privately. Bodies may carry
 * personal or confidential details, so no endpoint ever returns them;
 * admins read them with wrangler, off the wire entirely:
 *   GET    /api/feedback          the mood tally only (no bodies, ever)
 *   POST   /api/feedback          post one ({ mood, body })
 *
 * Plus a write-only measurement drop box (allowlisted names, no GET):
 *   POST   /api/events            record one usage event ({ name, value? })
 *
 * And Web Push (closed-tab notifications; no-ops until the VAPID secret is set):
 *   GET    /api/push/key          the applicationServerKey, or null
 *   POST   /api/push/subscribe    register this browser ({ endpoint, p256dh, auth })
 *   POST   /api/push/unsubscribe  unregister ({ endpoint })
 *
 * Mutations return the refreshed list too, so the client never needs a second
 * round trip to re-render. Everything else falls through to the static assets
 * built by Vite.
 */

import { CONFIG } from '../shared/config.js';
import {
  QUEUE_SUBJECT,
  isEventName,
  isMoodKey,
  isSubjectKey,
  isValidReportValue,
  normalizeFeedbackBody,
  type FeedbackResponse,
  type MoodKey,
  type Report,
  type ReportsResponse,
} from '../shared/domain.js';
import { buildDrinkReportRows, parseDrinkReport } from '../shared/drinkReport.js';
import { RHYTHM_WINDOW_MS, type RhythmResponse } from '../shared/rhythm.js';
import type { Env } from './env.js';
import { resolveIdentity, withIdentityCookie, type Identity } from './identity.js';
import { notifyAfterUndoWindow, parseVapidJwk, postingNotificationBody } from './notify.js';
import { b64urlEncode, parsePushSubscription, vapidPublicRaw } from './push.js';
import {
  countRecentEvents,
  countRecentFeedback,
  countRecentPostings,
  deleteOwnRecentGroup,
  deleteOwnRecentReport,
  deletePushSubscription,
  ensureUserLabel,
  insertEvent,
  insertFeedback,
  insertReport,
  insertReportRows,
  listRecentReports,
  tallyDrinkReports,
  tallyFeedback,
  tallyRhythm,
  upsertPushSubscription,
} from './store.js';

/** Ceiling on how many reports one device may post per minute. */
const POST_RATE_LIMIT = 20;

/**
 * Ceiling on feedback per device per day. Machine reports are the product and
 * get a generous per-minute limit; feedback is commentary on a public page,
 * so the budget is small enough that a prankster's evening is short.
 */
const FEEDBACK_RATE_LIMIT = 5;

/** Usage events per device per minute — generous, but a flood stays local. */
const EVENT_RATE_LIMIT = 30;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}

async function snapshot(env: Env, identity: Identity, now: number): Promise<ReportsResponse> {
  return {
    reports: await listRecentReports(env.DB, now),
    drinkTotals: await tallyDrinkReports(env.DB),
    me: identity.userId,
    serverNow: now,
  };
}

async function handleGet(env: Env, identity: Identity, now: number): Promise<Response> {
  return json(await snapshot(env, identity, now));
}

async function handlePost(
  request: Request,
  env: Env,
  identity: Identity,
  now: number,
  ctx: ExecutionContext,
): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(400, 'リクエストの形式が正しくありません');
  }

  const { subject, action } = (payload ?? {}) as { subject?: unknown; action?: unknown };
  if (!isSubjectKey(subject)) return fail(400, '対象の指定が正しくありません');
  if (!isValidReportValue(subject, action)) {
    return fail(
      400,
      subject === QUEUE_SUBJECT ? '待ち人数の指定が正しくありません' : '状態の指定が正しくありません',
    );
  }

  if ((await countRecentPostings(env.DB, identity.userId, now - 60_000)) >= POST_RATE_LIMIT) {
    return fail(429, '投稿が多すぎます。少し時間をおいてからお試しください');
  }

  const report: Report = {
    id: crypto.randomUUID(),
    subject,
    action,
    userId: identity.userId,
    userLabel: await ensureUserLabel(env.DB, identity.userId, now),
    createdAt: now,
  };
  await insertReport(env.DB, report);
  // Single rows store their own id as group_id, so the same delayed-send
  // pipeline serves both posting shapes.
  ctx.waitUntil(
    notifyAfterUndoWindow(env, report.id, identity.userId, postingNotificationBody([report])),
  );

  return json({ report, ...(await snapshot(env, identity, now)) }, 201);
}

/**
 * A drink report: 「カフェモカを作れた／作れなかった」. One posting fans out
 * into the drink verdict plus the material votes it implies (see
 * shared/drinkReport.ts for the expansion rules), all under one group id so
 * undo removes the posting as a whole.
 */
async function handleDrinkPost(
  request: Request,
  env: Env,
  identity: Identity,
  now: number,
  ctx: ExecutionContext,
): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(400, 'リクエストの形式が正しくありません');
  }

  const input = parseDrinkReport(payload);
  if (!input) return fail(400, 'ドリンク報告の内容が正しくありません');

  if ((await countRecentPostings(env.DB, identity.userId, now - 60_000)) >= POST_RATE_LIMIT) {
    return fail(429, '投稿が多すぎます。少し時間をおいてからお試しください');
  }

  const userLabel = await ensureUserLabel(env.DB, identity.userId, now);
  const groupId = crypto.randomUUID();
  const rows: Report[] = buildDrinkReportRows(input).map((seed) => ({
    id: crypto.randomUUID(),
    subject: seed.subject,
    action: seed.action,
    userId: identity.userId,
    userLabel,
    createdAt: now,
  }));
  await insertReportRows(env.DB, rows, groupId);
  ctx.waitUntil(
    notifyAfterUndoWindow(env, groupId, identity.userId, postingNotificationBody(rows)),
  );

  return json({ groupId, ...(await snapshot(env, identity, now)) }, 201);
}

async function handleGroupDelete(
  groupId: string,
  env: Env,
  identity: Identity,
  now: number,
): Promise<Response> {
  const removed = await deleteOwnRecentGroup(env.DB, groupId, identity.userId, now);
  if (!removed) return fail(404, '取り消せる投稿が見つかりませんでした');
  return json({ ok: true, ...(await snapshot(env, identity, now)) });
}

async function handleDelete(
  id: string,
  env: Env,
  identity: Identity,
  now: number,
): Promise<Response> {
  const removed = await deleteOwnRecentReport(env.DB, id, identity.userId, now);
  if (!removed) return fail(404, '取り消せる投稿が見つかりませんでした');
  return json({ ok: true, ...(await snapshot(env, identity, now)) });
}

/**
 * Bodies never leave the database through the API — the mood tally is the
 * whole public surface of ご意見箱. The empty feedback array keeps clients
 * cached from the public-list era from crashing on the new shape.
 */
async function feedbackSnapshot(env: Env, now: number): Promise<FeedbackResponse> {
  return {
    feedback: [],
    tally: await tallyFeedback(env.DB),
    serverNow: now,
  };
}

/** POST and PUT accept the same body; a Response here is the 400 to return. */
async function parseFeedbackPayload(
  request: Request,
): Promise<{ mood: MoodKey; body: string } | Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(400, 'リクエストの形式が正しくありません');
  }

  const { mood, body } = (payload ?? {}) as { mood?: unknown; body?: unknown };
  if (!isMoodKey(mood)) return fail(400, '満足度の指定が正しくありません');
  const normalized = normalizeFeedbackBody(body ?? '', CONFIG.feedbackMaxLength);
  if (normalized === null) {
    return fail(400, `ご意見は${CONFIG.feedbackMaxLength}文字以内でお願いします`);
  }
  return { mood, body: normalized };
}

async function handleFeedbackPost(
  request: Request,
  env: Env,
  identity: Identity,
  now: number,
): Promise<Response> {
  const parsed = await parseFeedbackPayload(request);
  if (parsed instanceof Response) return parsed;

  if ((await countRecentFeedback(env.DB, identity.userId, now - 86_400_000)) >= FEEDBACK_RATE_LIMIT) {
    return fail(429, '本日のご意見はここまでです。また明日お聞かせください');
  }

  await insertFeedback(env.DB, {
    id: crypto.randomUUID(),
    mood: parsed.mood,
    body: parsed.body,
    userId: identity.userId,
    userLabel: await ensureUserLabel(env.DB, identity.userId, now),
    createdAt: now,
  });

  return json(await feedbackSnapshot(env, now), 201);
}

/**
 * The measurement drop box. Only allowlisted names are stored, `value` must
 * be a small non-negative number, and over-limit devices get a silent 200 —
 * metrics are not worth teaching a client to retry, and not worth an error
 * toast in anyone's face.
 */
async function handleEventPost(
  request: Request,
  env: Env,
  identity: Identity,
  now: number,
): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(400, 'リクエストの形式が正しくありません');
  }

  const { name, value } = (payload ?? {}) as { name?: unknown; value?: unknown };
  if (!isEventName(name)) return fail(400, 'イベント名が正しくありません');

  let stored: number | null = null;
  if (value !== undefined && value !== null) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 86_400) {
      return fail(400, 'イベント値が正しくありません');
    }
    stored = Math.round(value);
  }

  if ((await countRecentEvents(env.DB, identity.userId, now - 60_000)) < EVENT_RATE_LIMIT) {
    await insertEvent(env.DB, name, stored, identity.userId, now);
  }
  return json({ ok: true });
}

/* ------------------------------------------------------------- Web Push -- */

/**
 * The applicationServerKey the client subscribes with, derived from the
 * secret on every call (cheap — two base64 decodes). `null` tells the client
 * the operator hasn't configured push, and the toggle hides itself.
 */
function handlePushKey(env: Env): Response {
  const jwk = parseVapidJwk(env);
  return json({ key: jwk ? b64urlEncode(vapidPublicRaw(jwk)) : null });
}

async function handlePushSubscribe(
  request: Request,
  env: Env,
  identity: Identity,
  now: number,
): Promise<Response> {
  if (!parseVapidJwk(env)) return fail(503, '通知はこのサーバーでは設定されていません');

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(400, 'リクエストの形式が正しくありません');
  }
  const sub = parsePushSubscription(payload);
  if (!sub) return fail(400, '購読情報の形式が正しくありません');

  await upsertPushSubscription(env.DB, { ...sub, userId: identity.userId }, now);
  return json({ ok: true }, 201);
}

/** Idempotent: unsubscribing an unknown endpoint is already the goal state. */
async function handlePushUnsubscribe(request: Request, env: Env): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(400, 'リクエストの形式が正しくありません');
  }
  const { endpoint } = (payload ?? {}) as { endpoint?: unknown };
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 1024) {
    return fail(400, '購読情報の形式が正しくありません');
  }
  await deletePushSubscription(env.DB, endpoint);
  return json({ ok: true });
}

async function route(
  request: Request,
  env: Env,
  url: URL,
  identity: Identity,
  ctx: ExecutionContext,
): Promise<Response> {
  const now = Date.now();
  const path = url.pathname;

  if (path === '/api/reports') {
    if (request.method === 'GET') return handleGet(env, identity, now);
    if (request.method === 'POST') return handlePost(request, env, identity, now, ctx);
    return fail(405, 'サポートされていないメソッドです');
  }

  // The fixed paths must be tested before the /api/reports/:id pattern,
  // which would otherwise swallow them as report ids.
  if (path === '/api/reports/drink') {
    if (request.method === 'POST') return handleDrinkPost(request, env, identity, now, ctx);
    return fail(405, 'サポートされていないメソッドです');
  }

  if (path === '/api/reports/rhythm') {
    if (request.method === 'GET') {
      return json({
        cells: await tallyRhythm(env.DB, now - RHYTHM_WINDOW_MS),
        serverNow: now,
      } satisfies RhythmResponse);
    }
    return fail(405, 'サポートされていないメソッドです');
  }

  const group = /^\/api\/reports\/group\/([^/]+)$/.exec(path);
  if (group) {
    if (request.method === 'DELETE') {
      return handleGroupDelete(decodeURIComponent(group[1]), env, identity, now);
    }
    return fail(405, 'サポートされていないメソッドです');
  }

  const match = /^\/api\/reports\/([^/]+)$/.exec(path);
  if (match) {
    if (request.method === 'DELETE') return handleDelete(decodeURIComponent(match[1]), env, identity, now);
    return fail(405, 'サポートされていないメソッドです');
  }

  if (path === '/api/feedback') {
    if (request.method === 'GET') return json(await feedbackSnapshot(env, now));
    if (request.method === 'POST') return handleFeedbackPost(request, env, identity, now);
    return fail(405, 'サポートされていないメソッドです');
  }



  if (path === '/api/events') {
    if (request.method === 'POST') return handleEventPost(request, env, identity, now);
    return fail(405, 'サポートされていないメソッドです');
  }

  if (path === '/api/push/key') {
    if (request.method === 'GET') return handlePushKey(env);
    return fail(405, 'サポートされていないメソッドです');
  }

  if (path === '/api/push/subscribe') {
    if (request.method === 'POST') return handlePushSubscribe(request, env, identity, now);
    return fail(405, 'サポートされていないメソッドです');
  }

  if (path === '/api/push/unsubscribe') {
    if (request.method === 'POST') return handlePushUnsubscribe(request, env);
    return fail(405, 'サポートされていないメソッドです');
  }

  return fail(404, 'エンドポイントが見つかりません');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const identity = await resolveIdentity(request, env);
    let response: Response;
    try {
      response = await route(request, env, url, identity, ctx);
    } catch (err) {
      console.error('[api]', err);
      response = fail(500, 'サーバーでエラーが発生しました');
    }
    return withIdentityCookie(response, identity, env, url);
  },
} satisfies ExportedHandler<Env>;
