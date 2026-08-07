/**
 * Anonymous device identity.
 *
 * There is no login. Each browser gets an opaque id in a signed, httpOnly
 * cookie on first visit; that id is what "one vote per person" counts. The
 * signature stops anyone from handing themselves a fistful of extra votes by
 * editing the cookie — a forged id fails verification and is replaced.
 *
 * Identity resolution is deliberately confined to this module: swapping to
 * Cloudflare Access (reading the verified `Cf-Access-Jwt-Assertion` header
 * instead) means changing `resolveIdentity` and nothing else.
 */

import type { Env } from './env.js';

const COOKIE_NAME = 'dsid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year
const DEV_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';

export interface Identity {
  userId: string;
  /** True when this request minted a new id and the cookie must be set. */
  isNew: boolean;
}

function secretFor(env: Env): string {
  return env.SESSION_SECRET || DEV_SECRET;
}

function base64url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

/** Constant-time-ish comparison; both inputs are same-length base64url digests. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Returns the caller's device id, minting and signing a new one if needed. */
export async function resolveIdentity(request: Request, env: Env): Promise<Identity> {
  const raw = readCookie(request, COOKIE_NAME);
  if (raw) {
    const dot = raw.lastIndexOf('.');
    if (dot > 0) {
      const userId = raw.slice(0, dot);
      const signature = raw.slice(dot + 1);
      const expected = await sign(userId, secretFor(env));
      if (safeEqual(signature, expected)) return { userId, isNew: false };
    }
  }
  return { userId: crypto.randomUUID(), isNew: true };
}

/** Attaches the identity cookie to a response when a new id was minted. */
export async function withIdentityCookie(
  response: Response,
  identity: Identity,
  env: Env,
  url: URL,
): Promise<Response> {
  if (!identity.isNew) return response;
  const signed = `${identity.userId}.${await sign(identity.userId, secretFor(env))}`;
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(signed)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE}`,
  ];
  // Browsers reject Secure cookies over plain http except on localhost, so the
  // flag is dropped only where it would break local development.
  if (url.protocol === 'https:') attrs.push('Secure');

  const out = new Response(response.body, response);
  out.headers.append('Set-Cookie', attrs.join('; '));
  return out;
}
