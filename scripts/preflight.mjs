#!/usr/bin/env node
/**
 * Runs automatically before `npm run deploy` (npm's `predeploy` hook).
 *
 * Catches the one failure that costs the most time to diagnose: deploying
 * with the placeholder database id still in wrangler.toml. That happens
 * whenever someone re-clones, since setup-cloudflare.sh writes the real id
 * into the working copy and there is no reason for anyone to have committed it.
 * Left to wrangler, the failure surfaces as an opaque D1 error.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = readFileSync(join(root, 'wrangler.toml'), 'utf8');

const id = config.match(/^database_id\s*=\s*"(.*)"/m)?.[1];

if (!id || id.startsWith('REPLACE_WITH')) {
  console.error(`
\x1b[31m✗ デプロイできません: wrangler.toml の database_id が未設定です\x1b[0m

  現在の値: ${id ?? '(見つかりません)'}

  D1 データベースがまだ作られていないか、clone し直して設定が
  巻き戻っています。次を実行すると、作成・記入・スキーマ適用・
  シークレット登録・デプロイまで済みます（冪等です）。

      npx wrangler login
      ./scripts/setup-cloudflare.sh

  すでに D1 がある場合は、id を確認して直接書き込んでも構いません。

      npx wrangler d1 list

  今後この巻き戻りを防ぐには、書き込まれた値をコミットしてください
  （database_id は認証情報ではないので、コミットして問題ありません）。

      git add wrangler.toml && git commit -m "Set D1 database id"
`);
  process.exit(1);
}

if (!/^[0-9a-f-]{32,36}$/i.test(id)) {
  console.error(`\n\x1b[31m✗ database_id の形式が不正です: ${id}\x1b[0m`);
  console.error('  `npx wrangler d1 list` の uuid を設定してください。\n');
  process.exit(1);
}
