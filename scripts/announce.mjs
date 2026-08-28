#!/usr/bin/env node
/**
 * 通知ONの全端末へ、管理者からのお知らせをプッシュ配信します。
 *
 *   $env:ANNOUNCE_TOKEN = "<wrangler secret に登録した値>"
 *   $env:SITE_URL = "https://<あなたのデプロイURL>"
 *   node scripts/announce.mjs "本文（200文字まで）" --title "見出し（任意・40文字まで）"
 *
 * トークンは引数ではなく環境変数で渡します（シェル履歴に残さないため）。
 * 送信後は Remove-Item Env:ANNOUNCE_TOKEN で消しておくと安全です。
 */

const args = process.argv.slice(2);
const titleIdx = args.indexOf('--title');
const title = titleIdx >= 0 ? args[titleIdx + 1] : undefined;
const body = args.filter((_, i) => i !== titleIdx && i !== titleIdx + 1)[0];

const token = process.env.ANNOUNCE_TOKEN;
const site = (process.env.SITE_URL ?? '').replace(/\/$/, '');

if (!body || !token || !site) {
  console.error('使い方:');
  console.error('  $env:ANNOUNCE_TOKEN = "<ANNOUNCE_TOKEN の値>"');
  console.error('  $env:SITE_URL = "https://<デプロイURL>"');
  console.error('  node scripts/announce.mjs "本文" [--title "見出し"]');
  process.exit(1);
}

const res = await fetch(`${site}/api/push/announce`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ body, ...(title ? { title } : {}) }),
});

const data = await res.json().catch(() => null);
if (!res.ok) {
  console.error(`✗ 送信に失敗しました (${res.status}): ${data?.error ?? '不明なエラー'}`);
  if (res.status === 404) {
    console.error('  トークンが違うか、サーバーに ANNOUNCE_TOKEN が未設定です。');
  }
  process.exit(1);
}

console.log(
  `✓ 配信しました: 購読 ${data.attempted}件へ送信、到達 ${data.delivered}件、失効削除 ${data.gone}件`,
);
if (data.attempted === 0) {
  console.log('  （通知ONの端末がまだありません）');
}
