import { describe, expect, it } from 'vitest';
import {
  b64urlDecode,
  b64urlEncode,
  encryptPayload,
  parsePushSubscription,
  vapidAuthorization,
  vapidPublicRaw,
  type VapidJwk,
} from './push.js';

/**
 * The RFC 8291 test vectors live behind this environment's egress block, so
 * the encoder is checked the next-strongest way: an independently written
 * RECEIVER (this file implements the RFC's decryption side from the spec,
 * not by importing the encoder's helpers) must recover the exact plaintext,
 * and the wire format is asserted field by field. VAPID tokens are verified
 * with WebCrypto's own ES256 verifier.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A browser-side subscription: UA ECDH pair + 16-byte auth secret. */
async function makeSubscription() {
  const uaPair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const p256dh = b64urlEncode(
    new Uint8Array((await crypto.subtle.exportKey('raw', uaPair.publicKey)) as ArrayBuffer),
  );
  const auth = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
  return { uaPair, p256dh, auth };
}

/** Independent RFC 8291 receiver: parse the body, derive, decrypt. */
async function decryptBody(body: Uint8Array, uaPair: CryptoKeyPair, authB64: string) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20];
  const asPublicRaw = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);

  const asPublicKey = await crypto.subtle.importKey(
    'raw',
    asPublicRaw as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: asPublicKey } as unknown as Parameters<
        typeof crypto.subtle.deriveBits
      >[0],
      uaPair.privateKey,
      256,
    ),
  );
  const uaPublicRaw = new Uint8Array((await crypto.subtle.exportKey('raw', uaPair.publicKey)) as ArrayBuffer);

  const hkdf = async (saltB: Uint8Array, ikm: Uint8Array, info: Uint8Array, bits: number) => {
    const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
      'deriveBits',
    ]);
    return new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: saltB as BufferSource, info: info as BufferSource },
        key,
        bits,
      ),
    );
  };

  const infoIkm = new Uint8Array([
    ...enc.encode('WebPush: info\0'),
    ...uaPublicRaw,
    ...asPublicRaw,
  ]);
  const ikm = await hkdf(b64urlDecode(authB64), ecdhSecret, infoIkm, 256);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 96);

  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
    'decrypt',
  ]);
  const record = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      aesKey,
      ciphertext as BufferSource,
    ),
  );
  return { salt, rs, idlen, asPublicRaw, record };
}

describe('b64url', () => {
  it('round-trips arbitrary bytes without padding characters', () => {
    for (const len of [0, 1, 2, 3, 16, 65]) {
      const bytes = crypto.getRandomValues(new Uint8Array(len));
      const encoded = b64urlEncode(bytes);
      expect(encoded).not.toMatch(/[+/=]/);
      expect([...b64urlDecode(encoded)]).toEqual([...bytes]);
    }
  });
});

describe('encryptPayload (RFC 8291 aes128gcm)', () => {
  it('an independent receiver recovers the exact plaintext', async () => {
    const { uaPair, p256dh, auth } = await makeSubscription();
    const message = '利用者Bさんが カフェモカ「作れた」と投稿しました';
    const body = await encryptPayload(enc.encode(message), p256dh, auth);

    const { record } = await decryptBody(body, uaPair, auth);
    // Last-record delimiter 0x02, then nothing (no padding).
    expect(record[record.length - 1]).toBe(0x02);
    expect(dec.decode(record.slice(0, -1))).toBe(message);
  });

  it('lays out the aes128gcm header exactly', async () => {
    const { uaPair, p256dh, auth } = await makeSubscription();
    const payload = enc.encode('x');
    const body = await encryptPayload(payload, p256dh, auth);

    const { salt, rs, idlen, asPublicRaw } = await decryptBody(body, uaPair, auth);
    expect(salt.length).toBe(16);
    expect(rs).toBe(4096);
    expect(idlen).toBe(65);
    expect(asPublicRaw[0]).toBe(0x04); // uncompressed P-256 point
    // header(21+65) + payload + delimiter(1) + GCM tag(16)
    expect(body.length).toBe(21 + 65 + payload.length + 1 + 16);
  });

  it('rejects tampering — flipping one ciphertext bit breaks decryption', async () => {
    const { uaPair, p256dh, auth } = await makeSubscription();
    const body = await encryptPayload(enc.encode('hello'), p256dh, auth);
    body[body.length - 1] ^= 0x01;
    await expect(decryptBody(body, uaPair, auth)).rejects.toThrow();
  });

  it('is deterministic under a fixed sender key and salt', async () => {
    const { p256dh, auth } = await makeSubscription();
    const localKeyPair = (await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    )) as CryptoKeyPair;
    const salt = new Uint8Array(16).fill(7);
    const a = await encryptPayload(enc.encode('same'), p256dh, auth, { localKeyPair, salt });
    const b = await encryptPayload(enc.encode('same'), p256dh, auth, { localKeyPair, salt });
    expect(b64urlEncode(a)).toBe(b64urlEncode(b));
  });
});

describe('parsePushSubscription', () => {
  async function validPayload() {
    const { p256dh, auth } = await makeSubscription();
    return { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh, auth };
  }

  it('accepts what a real browser subscription serializes to', async () => {
    const payload = await validPayload();
    expect(parsePushSubscription(payload)).toEqual(payload);
  });

  it('rejects non-https endpoints, junk URLs, and oversized endpoints', async () => {
    const ok = await validPayload();
    expect(parsePushSubscription({ ...ok, endpoint: 'http://evil.example/x' })).toBeNull();
    expect(parsePushSubscription({ ...ok, endpoint: 'not a url' })).toBeNull();
    expect(parsePushSubscription({ ...ok, endpoint: `https://x.example/${'a'.repeat(1024)}` })).toBeNull();
  });

  it('rejects key material of the wrong shape', async () => {
    const ok = await validPayload();
    // Wrong length, wrong lead byte, and undecodable garbage.
    expect(parsePushSubscription({ ...ok, p256dh: b64urlEncode(new Uint8Array(64)) })).toBeNull();
    expect(
      parsePushSubscription({ ...ok, p256dh: b64urlEncode(new Uint8Array(65).fill(0x05)) }),
    ).toBeNull();
    expect(parsePushSubscription({ ...ok, p256dh: '!!!' })).toBeNull();
    expect(parsePushSubscription({ ...ok, auth: b64urlEncode(new Uint8Array(15)) })).toBeNull();
    expect(parsePushSubscription({ ...ok, auth: undefined })).toBeNull();
    expect(parsePushSubscription(null)).toBeNull();
    expect(parsePushSubscription('string')).toBeNull();
  });
});

describe('vapidAuthorization (RFC 8292)', () => {
  async function makeVapid(): Promise<VapidJwk> {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    return (await crypto.subtle.exportKey('jwk', pair.privateKey)) as unknown as VapidJwk;
  }

  it('emits a header whose JWT verifies against the advertised key', async () => {
    const jwk = await makeVapid();
    const header = await vapidAuthorization(
      'https://fcm.googleapis.com/fcm/send/abc123',
      jwk,
      'mailto:admin@example.com',
      1_700_000_000,
    );

    const m = /^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/.exec(header);
    expect(m).not.toBeNull();
    const [, jwt, k] = m!;

    // The advertised key is the uncompressed public point of the signing key.
    expect([...b64urlDecode(k)]).toEqual([...vapidPublicRaw(jwk)]);
    expect(b64urlDecode(k).length).toBe(65);

    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(dec.decode(b64urlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    const payload = JSON.parse(dec.decode(b64urlDecode(p)));
    expect(payload.aud).toBe('https://fcm.googleapis.com');
    expect(payload.sub).toBe('mailto:admin@example.com');
    expect(payload.exp).toBe(1_700_000_000 + 12 * 3600);

    const publicJwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
    const verifyKey = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const okSig = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      b64urlDecode(s) as BufferSource,
      enc.encode(`${h}.${p}`) as BufferSource,
    );
    expect(okSig).toBe(true);
  });
});
