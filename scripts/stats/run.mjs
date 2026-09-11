#!/usr/bin/env node
/**
 * 利用状況の集計（scripts/stats/*.sql）を D1 に投げ、結果を Markdown の表で出します。
 *
 *   node scripts/stats/run.mjs --remote summary trend breakdown              # 本番 D1（CLOUDFLARE_API_TOKEN が必要）
 *   node scripts/stats/run.mjs --local  summary                              # ローカル D1（.wrangler/state）
 *   node scripts/stats/run.mjs --local --persist-to=.stats-fixture.local summary   # 隔離した検証用 DB
 *
 * stdout は Markdown だけなので、GitHub Actions では GITHUB_STEP_SUMMARY にそのまま追記できます
 * （.github/workflows/stats.yml）。
 *
 * --file ではなく --command で渡す理由: wrangler 4 の `d1 execute --remote --file` は D1 の
 * インポート API（ファイルを R2 に上げて取り込む経路）を使い、SELECT の結果行を返しません
 * （返るのは実行文数と rows_read だけ）。--command は /query API で、文ごとの結果行が --json で
 * 返ります。/query が SQL コメントを受けるかは当てにせず、行頭 `--` のコメント行はここで落とします。
 * SQL ファイル側の約束: コメントは行頭 `--` の行だけ、1ファイル1文。
 *
 * ログは public です。集計値・日付・「利用者X」ラベル以外を出す列（user_id・endpoint・本文など）が
 * 結果に含まれていたら、表を出さずに失敗させます（FORBIDDEN_COLUMNS）。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 実行できる SQL とその見出し。ここに無い名前は受け付けない（fixture などを本番に流さないため）。 */
export const QUERIES = {
  summary: '累計（端末数）',
  trend: '日別・週別の推移（JST、週は月曜起点）',
  breakdown: '投稿の内訳',
  detail: '端末ごとの明細（ラベルのみ）',
};

/** これらの列名が結果に出たら SQL の書き間違い。public なログに出す前に止める。 */
export const FORBIDDEN_COLUMNS = ['id', 'pid', 'user_id', 'endpoint', 'p256dh', 'auth', 'body'];

export function loadSql(name) {
  const text = readFileSync(new URL(`./${name}.sql`, import.meta.url), 'utf8');
  return text
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');
}

/** wrangler --json の出力（文ごとの { results, success, meta } の配列）を Markdown 表にする。 */
export function renderMarkdown(name, statements) {
  const out = [`## ${QUERIES[name] ?? name}`, ''];
  for (const s of statements) {
    const rows = s.results ?? [];
    if (rows.length === 0) {
      out.push('_(0 行)_', '');
      continue;
    }
    const cols = Object.keys(rows[0]);
    const leaked = cols.filter((c) => FORBIDDEN_COLUMNS.includes(c));
    if (leaked.length > 0) {
      throw new Error(`${name}: 出してはいけない列が結果にあります: ${leaked.join(', ')}`);
    }
    const cell = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\|/g, '\\|');
    out.push(`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`);
    for (const r of rows) out.push(`| ${cols.map((c) => cell(r[c])).join(' | ')} |`);
    out.push('', `_${rows.length} 行（rows_read ${s.meta?.rows_read ?? '-'}）_`, '');
  }
  return out.join('\n') + '\n';
}

function main(argv) {
  const mode = argv.find((a) => a === '--remote' || a === '--local');
  const names = argv.filter((a) => !a.startsWith('--'));
  const passthrough = argv.filter((a) => a.startsWith('--') && a !== mode);
  const unknown = names.filter((n) => !(n in QUERIES));
  if (!mode || names.length === 0 || unknown.length > 0) {
    console.error(
      `使い方: node scripts/stats/run.mjs (--remote|--local) [--persist-to=DIR] <${Object.keys(QUERIES).join('|')}>...`,
    );
    return 1;
  }
  // npx ではなく npm ci が入れた固定版を直接。Windows でも .cmd シムを経由しない。
  const wrangler = fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
  process.stdout.write(`_集計時刻 ${now} JST（${mode === '--remote' ? '本番' : 'ローカル'} D1）_\n\n`);

  for (const name of names) {
    const res = spawnSync(
      process.execPath,
      [wrangler, 'd1', 'execute', 'drink-status', mode, ...passthrough, '--json', '--command', loadSql(name)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    );
    if (res.status !== 0) {
      process.stderr.write(res.stdout ?? '');
      return res.status ?? 1;
    }
    let statements;
    try {
      statements = JSON.parse(res.stdout);
    } catch {
      console.error(`${name}: wrangler の出力が JSON ではありません:\n${res.stdout}`);
      return 1;
    }
    process.stdout.write(renderMarkdown(name, statements));
  }
  return 0;
}

// テストから import できるよう、直接実行されたときだけ main を走らせる。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
