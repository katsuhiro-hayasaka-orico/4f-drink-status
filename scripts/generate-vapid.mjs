#!/usr/bin/env node
/**
 * Web Push 用の VAPID 鍵ペア（P-256）を新規生成します。
 *
 *   node scripts/generate-vapid.mjs
 *
 * 表示される秘密鍵 JWK を、そのまま Cloudflare の secret に設定してください:
 *
 *   npx wrangler secret put VAPID_PRIVATE_JWK
 *
 * ローカル開発（wrangler dev）では .dev.vars に書きます（git 管理外）。
 * 秘密鍵をコードやリポジトリにコミットしてはいけません。鍵を作り直すと
 * 既存の購読は全て無効になります（全員が通知を ON し直す必要があります）。
 */
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;

const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const jwk = await subtle.exportKey('jwk', pair.privateKey);
const privateJwk = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const publicRaw = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(jwk.x, 'base64url'),
  Buffer.from(jwk.y, 'base64url'),
]);

console.log('VAPID 鍵ペアを生成しました。\n');
console.log('■ 秘密鍵 JWK（wrangler secret put VAPID_PRIVATE_JWK に貼り付け）:');
console.log(privateJwk);
console.log('\n■ .dev.vars 用（ローカル開発のみ・コミット禁止）:');
console.log(`VAPID_PRIVATE_JWK=${privateJwk}`);
console.log('\n■ 公開鍵（参考: サーバーが /api/push/key で自動配布するので設定不要）:');
console.log(b64url(publicRaw));
