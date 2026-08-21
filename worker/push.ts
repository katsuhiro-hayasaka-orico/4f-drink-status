/**
 * Web Push sender (RFC 8030 delivery, RFC 8291 encryption, RFC 8292 VAPID),
 * implemented directly on WebCrypto — no dependencies, nothing the free
 * Workers plan doesn't provide. Push services (APNs, FCM, Mozilla) accept
 * this protocol from anyone with a VAPID key pair; no vendor accounts.
 *
 * Correctness strategy: `shared/push.test.ts` decrypts this module's output
 * with an independently written decoder (the RFC's receiver side), checks
 * the aes128gcm wire layout field by field, and verifies the VAPID JWT with
 * WebCrypto's own verifier. The RFC test vectors live behind an egress
 * block, so round-trip + structure is the strongest check available here;
 * the deploy docs include a real-device delivery check as the final word.
 */

const encoder = new TextEncoder();

/* ------------------------------------------------------------ base64url -- */

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/* ----------------------------------------------------------------- VAPID -- */

/** The stored secret: a P-256 private JWK (with d, x, y). */
export interface VapidJwk extends JsonWebKey {
  x: string;
  y: string;
  d?: string;
}

/** Uncompressed EC point (0x04 || x || y) — the applicationServerKey form. */
export function vapidPublicRaw(jwk: VapidJwk): Uint8Array {
  return concat(new Uint8Array([0x04]), b64urlDecode(jwk.x), b64urlDecode(jwk.y));
}

/**
 * RFC 8292 Authorization header for one push service origin. Tokens are
 * cached per origin for a few hours — push services only check aud+exp.
 */
export async function vapidAuthorization(
  endpoint: string,
  jwk: VapidJwk,
  subject: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = b64urlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64urlEncode(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: nowSec + 12 * 3600,
        sub: subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  // WebCrypto ECDSA emits the raw r||s form JWS ES256 wants — no DER dance.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      encoder.encode(signingInput),
    ),
  );
  const jwt = `${signingInput}.${b64urlEncode(signature)}`;
  return `vapid t=${jwt}, k=${b64urlEncode(vapidPublicRaw(jwk))}`;
}

/* ------------------------------------------------- RFC 8291 encryption --- */

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bits: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
    'deriveBits',
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
      key,
      bits,
    ),
  );
}

export interface EncryptOverrides {
  /** Test hooks: a fixed sender key pair and salt make the output reproducible. */
  localKeyPair?: CryptoKeyPair;
  salt?: Uint8Array;
}

/**
 * Encrypts one payload for one subscription (RFC 8291, aes128gcm content
 * coding, single record, no padding). Returns the POST body.
 */
export async function encryptPayload(
  payload: Uint8Array,
  p256dhB64: string,
  authB64: string,
  overrides: EncryptOverrides = {},
): Promise<Uint8Array> {
  const uaPublicRaw = b64urlDecode(p256dhB64);
  const authSecret = b64urlDecode(authB64);

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicRaw as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const local =
    overrides.localKeyPair ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair);
  const localPublicRaw = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      // workers-types renames EcdhKeyDeriveParams' field, so name the param type
      // structurally via deriveBits' own signature — valid under both lib.dom
      // and workers-types.
      { name: 'ECDH', public: uaPublicKey } as unknown as Parameters<
        typeof crypto.subtle.deriveBits
      >[0],
      local.privateKey,
      256,
    ),
  );

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_pub || as_pub, 32)
  const ikm = await hkdf(
    authSecret,
    ecdhSecret,
    concat(encoder.encode('WebPush: info\0'), uaPublicRaw, localPublicRaw),
    256,
  );

  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 96);

  // Single (= last) record: payload || 0x02 delimiter, no padding.
  const record = concat(payload, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
    'encrypt',
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      aesKey,
      record as BufferSource,
    ),
  );

  // aes128gcm header: salt(16) || rs(4, BE) || idlen(1) || keyid(as_pub, 65)
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
  const idlen = new Uint8Array([localPublicRaw.length]);
  return concat(salt, rs, idlen, localPublicRaw, ciphertext);
}

/* ---------------------------------------------------------- subscriptions -- */

export interface ParsedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Validates what a browser's PushSubscription serializes to. Strict on
 * purpose: whatever passes here is stored and later fed to the encryptor, so
 * shape errors are cheapest to reject at the door. The key material must
 * actually decode — p256dh to an uncompressed P-256 point (65 bytes, 0x04
 * lead), auth to the RFC 8291 16-byte secret.
 */
export function parsePushSubscription(payload: unknown): ParsedSubscription | null {
  const { endpoint, p256dh, auth } = (payload ?? {}) as {
    endpoint?: unknown;
    p256dh?: unknown;
    auth?: unknown;
  };
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 1024) return null;
  try {
    if (new URL(endpoint).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  try {
    const point = b64urlDecode(p256dh);
    if (point.length !== 65 || point[0] !== 0x04) return null;
    if (b64urlDecode(auth).length !== 16) return null;
  } catch {
    return null;
  }
  return { endpoint, p256dh, auth };
}

/* -------------------------------------------------------------- delivery -- */

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = 'ok' | 'gone' | 'failed';

/**
 * Delivers one payload to one subscription. `gone` means the subscription
 * is dead (uninstalled PWA, revoked permission) and should be deleted.
 */
export async function sendPush(
  target: PushTarget,
  payload: Record<string, unknown>,
  vapidJwk: VapidJwk,
  subject: string,
): Promise<PushResult> {
  try {
    const body = await encryptPayload(
      encoder.encode(JSON.stringify(payload)),
      target.p256dh,
      target.auth,
    );
    const res = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(target.endpoint, vapidJwk, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '300',
        Urgency: 'normal',
      },
      body: body as unknown as BodyInit,
    });
    // Push services answer 201 (RFC) / 200-202 in the wild.
    if (res.ok) return 'ok';
    if (res.status === 404 || res.status === 410) return 'gone';
    return 'failed';
  } catch {
    return 'failed';
  }
}
