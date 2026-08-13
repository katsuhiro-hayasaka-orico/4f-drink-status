/**
 * 4Fドリンク速報 — Cloudflare Worker API.
 *
 * The machine board, over one D1 table:
 *   GET    /api/reports      the last 24h of observations
 *   POST   /api/reports      post one ({ subject, action })
 *   DELETE /api/reports/:id  take your own back, inside the undo window
 *
 * And みんなの声, site feedback with likes:
 *   GET    /api/feedback          newest entries, likes folded in
 *   POST   /api/feedback          post one ({ mood, body })
 *   POST   /api/feedback/:id/like toggle your like on an entry
 *
 * Mutations return the refreshed list too, so the client never needs a second
 * round trip to re-render. Everything else falls through to the static assets
 * built by Vite.
 */

import { CONFIG } from '../shared/config.js';
import {
  QUEUE_SUBJECT,
  isMoodKey,
  isSubjectKey,
  isValidReportValue,
  normalizeFeedbackBody,
  type FeedbackResponse,
  type Report,
  type ReportsResponse,
} from '../shared/domain.js';
import type { Env } from './env.js';
import { resolveIdentity, withIdentityCookie, type Identity } from './identity.js';
import {
  countRecentFeedback,
  deleteOwnRecentReport,
  ensureUserLabel,
  insertFeedback,
  insertReport,
  listFeedback,
  listRecentReports,
  toggleFeedbackLike,
} from './store.js';

/** Ceiling on how many reports one device may post per minute. */
const POST_RATE_LIMIT = 20;

/**
 * Ceiling on feedback per device per day. Machine reports are the product and
 * get a generous per-minute limit; feedback is commentary on a public page,
 * so the budget is small enough that a prankster's evening is short.
 */
const FEEDBACK_RATE_LIMIT = 5;

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

  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM reports WHERE user_id = ?1 AND created_at >= ?2',
  )
    .bind(identity.userId, now - 60_000)
    .first<{ n: number }>();
  if (Number(recent?.n ?? 0) >= POST_RATE_LIMIT) {
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

  return json({ report, ...(await snapshot(env, identity, now)) }, 201);
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

async function feedbackSnapshot(
  env: Env,
  identity: Identity,
  now: number,
): Promise<FeedbackResponse> {
  return {
    feedback: await listFeedback(env.DB, identity.userId),
    serverNow: now,
  };
}

async function handleFeedbackPost(
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

  const { mood, body } = (payload ?? {}) as { mood?: unknown; body?: unknown };
  if (!isMoodKey(mood)) return fail(400, '満足度の指定が正しくありません');
  const normalized = normalizeFeedbackBody(body ?? '', CONFIG.feedbackMaxLength);
  if (normalized === null) {
    return fail(400, `ご意見は${CONFIG.feedbackMaxLength}文字以内でお願いします`);
  }

  if ((await countRecentFeedback(env.DB, identity.userId, now - 86_400_000)) >= FEEDBACK_RATE_LIMIT) {
    return fail(429, '本日のご意見はここまでです。また明日お聞かせください');
  }

  await insertFeedback(env.DB, {
    id: crypto.randomUUID(),
    mood,
    body: normalized,
    userId: identity.userId,
    userLabel: await ensureUserLabel(env.DB, identity.userId, now),
    createdAt: now,
  });

  return json(await feedbackSnapshot(env, identity, now), 201);
}

async function handleFeedbackLike(
  id: string,
  env: Env,
  identity: Identity,
  now: number,
): Promise<Response> {
  const found = await toggleFeedbackLike(env.DB, id, identity.userId, now);
  if (!found) return fail(404, '対象のご意見が見つかりませんでした');
  return json(await feedbackSnapshot(env, identity, now));
}

async function route(
  request: Request,
  env: Env,
  url: URL,
  identity: Identity,
): Promise<Response> {
  const now = Date.now();
  const path = url.pathname;

  if (path === '/api/reports') {
    if (request.method === 'GET') return handleGet(env, identity, now);
    if (request.method === 'POST') return handlePost(request, env, identity, now);
    return fail(405, 'サポートされていないメソッドです');
  }

  const match = /^\/api\/reports\/([^/]+)$/.exec(path);
  if (match) {
    if (request.method === 'DELETE') return handleDelete(decodeURIComponent(match[1]), env, identity, now);
    return fail(405, 'サポートされていないメソッドです');
  }

  if (path === '/api/feedback') {
    if (request.method === 'GET') return json(await feedbackSnapshot(env, identity, now));
    if (request.method === 'POST') return handleFeedbackPost(request, env, identity, now);
    return fail(405, 'サポートされていないメソッドです');
  }

  const like = /^\/api\/feedback\/([^/]+)\/like$/.exec(path);
  if (like) {
    if (request.method === 'POST') {
      return handleFeedbackLike(decodeURIComponent(like[1]), env, identity, now);
    }
    return fail(405, 'サポートされていないメソッドです');
  }

  return fail(404, 'エンドポイントが見つかりません');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const identity = await resolveIdentity(request, env);
    let response: Response;
    try {
      response = await route(request, env, url, identity);
    } catch (err) {
      console.error('[api]', err);
      response = fail(500, 'サーバーでエラーが発生しました');
    }
    return withIdentityCookie(response, identity, env, url);
  },
} satisfies ExportedHandler<Env>;
