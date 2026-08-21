import { describe, expect, it } from 'vitest';
import type { Report, ReportRowValue, ReportSubject } from '../shared/domain.js';
import { parseVapidJwk, postingNotificationBody } from './notify.js';
import type { Env } from './env.js';

function row(subject: ReportSubject, action: ReportRowValue): Report {
  return {
    id: crypto.randomUUID(),
    subject,
    action,
    userId: 'u1',
    userLabel: '利用者B',
    createdAt: 1_700_000_000_000,
  };
}

describe('postingNotificationBody', () => {
  it('quotes the drink row of a fanned-out posting, not its material votes', () => {
    const rows = [
      row('coffeeBeans', 'available'),
      row('ice', 'available'),
      row('iceCoffee', 'made'),
      row('machine', 'available'),
    ];
    expect(postingNotificationBody(rows)).toBe(
      '利用者Bさんが アイスコーヒー「作れた」と投稿しました',
    );
  });

  it('speaks single reports in their own vocabulary', () => {
    expect(postingNotificationBody([row('milkPowder', 'refilled')])).toContain(
      'ミルク「補充された」',
    );
    expect(postingNotificationBody([row('queue', 'long')])).toContain('行列「6人以上」');
  });

  it('returns null for an empty posting', () => {
    expect(postingNotificationBody([])).toBeNull();
  });
});

describe('parseVapidJwk', () => {
  const env = (secret?: string) => ({ VAPID_PRIVATE_JWK: secret }) as Env;

  it('parses a complete private JWK', () => {
    const jwk = { kty: 'EC', crv: 'P-256', x: 'eA', y: 'eQ', d: 'ZA' };
    expect(parseVapidJwk(env(JSON.stringify(jwk)))).toEqual(jwk);
  });

  it('returns null while unset, on junk, and on a public-only key', () => {
    expect(parseVapidJwk(env(undefined))).toBeNull();
    expect(parseVapidJwk(env(''))).toBeNull();
    expect(parseVapidJwk(env('not json'))).toBeNull();
    expect(
      parseVapidJwk(env(JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'eA', y: 'eQ' }))),
    ).toBeNull();
    expect(
      parseVapidJwk(env(JSON.stringify({ kty: 'RSA', crv: 'P-256', x: 'eA', y: 'eQ', d: 'ZA' }))),
    ).toBeNull();
  });
});
