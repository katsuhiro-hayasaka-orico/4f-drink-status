#!/usr/bin/env bash
#
# 初回デプロイの一括セットアップ。
#
#   1. D1 データベースを作成（既にあれば再利用）
#   2. その database_id を wrangler.toml に書き込む
#   3. 本番データベースにスキーマを適用
#   4. SESSION_SECRET を生成して登録（既にあれば触らない）
#   5. VAPID_PRIVATE_JWK（Web Push 用）を生成して登録（既にあれば触らない）
#   6. ビルドしてデプロイ
#
# 何度実行しても同じ状態に収束します（冪等）。
#
#   ./scripts/setup-cloudflare.sh
#
set -euo pipefail

DB_NAME="drink-status"
CONFIG="wrangler.toml"
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- 認証確認 --
step "Cloudflare の認証を確認しています"
if ! npx wrangler whoami >/dev/null 2>&1; then
  fail "未認証です。先に 'npx wrangler login' を実行するか、CLOUDFLARE_API_TOKEN を設定してください。"
fi
npx wrangler whoami 2>/dev/null | grep -E 'Account Name|account_id|Account ID' || true

# ------------------------------------------------------- D1 データベース --
step "D1 データベース '$DB_NAME' を用意しています"
db_id() {
  npx wrangler d1 list --json 2>/dev/null \
    | node -e "
        let s='';
        process.stdin.on('data', d => s += d).on('end', () => {
          try {
            const hit = JSON.parse(s).find(d => d.name === '$DB_NAME');
            process.stdout.write(hit ? (hit.uuid || hit.database_id || '') : '');
          } catch { /* 未認証などで JSON でない場合は空を返す */ }
        });
      "
}

ID="$(db_id)"
if [ -z "$ID" ]; then
  echo "  見つからないので作成します…"
  npx wrangler d1 create "$DB_NAME" >/dev/null
  ID="$(db_id)"
fi
[ -n "$ID" ] || fail "database_id を取得できませんでした。'npx wrangler d1 list' の出力を確認してください。"
echo "  database_id: $ID"

# ---------------------------------------------- wrangler.toml へ書き込み --
step "$CONFIG を更新しています"
if grep -q "database_id = \"$ID\"" "$CONFIG"; then
  echo "  すでに正しい ID が設定されています。"
else
  # 現在の値がプレースホルダでも実 ID でも、常に今の ID に揃えます。
  node -e "
    const fs = require('fs');
    const p = '$CONFIG';
    const before = fs.readFileSync(p, 'utf8');
    const after = before.replace(/^database_id = \".*\"$/m, 'database_id = \"$ID\"');
    if (before === after) {
      console.error('  database_id の行が見つかりませんでした。手動で設定してください。');
      process.exit(1);
    }
    fs.writeFileSync(p, after);
  "
  echo "  database_id を書き込みました。"
fi

# ------------------------------------------------------- マイグレーション --
step "本番データベースにスキーマを適用しています"
npx wrangler d1 migrations apply "$DB_NAME" --remote

# ----------------------------------------------------- SESSION_SECRET --
step "SESSION_SECRET を確認しています"
if npx wrangler secret list 2>/dev/null | grep -q SESSION_SECRET; then
  echo "  設定済みのため、そのままにします。"
else
  echo "  未設定なので、ランダムな値を生成して登録します…"
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" \
    | npx wrangler secret put SESSION_SECRET
  echo "  登録しました（値は表示しません）。"
fi

# --------------------------------------------------- VAPID_PRIVATE_JWK --
step "VAPID_PRIVATE_JWK（Web Push の署名鍵）を確認しています"
if npx wrangler secret list 2>/dev/null | grep -q VAPID_PRIVATE_JWK; then
  echo "  設定済みのため、そのままにします。"
  echo "  （鍵を作り直すと全員の通知購読が無効になるため、自動では更新しません）"
else
  echo "  未設定なので、鍵ペアを生成して登録します…"
  node -e "
    const { webcrypto } = require('crypto');
    webcrypto.subtle
      .generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
      .then((p) => webcrypto.subtle.exportKey('jwk', p.privateKey))
      .then((j) =>
        console.log(JSON.stringify({ kty: j.kty, crv: j.crv, x: j.x, y: j.y, d: j.d })),
      );
  " | npx wrangler secret put VAPID_PRIVATE_JWK
  echo "  登録しました（値は表示しません）。"
fi

# ------------------------------------------------------------- デプロイ --
step "ビルドしてデプロイしています"
npm run build
npx wrangler deploy

printf '\n\033[32m✓ 完了しました。上に表示された URL で公開されています。\033[0m\n'
