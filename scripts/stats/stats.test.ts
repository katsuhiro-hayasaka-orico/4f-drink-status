import { readFileSync, readdirSync } from 'node:fs';
import type { DatabaseSync as Db } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_COLUMNS, loadSql, renderMarkdown } from './run.mjs';

// The real migrations and the fixture, in an in-memory SQLite — the same SQL
// the workflow sends to D1, minus wrangler and the network. node:sqlite ships
// with Node 22.13+; CI pins node-version 22.
const migrations = new URL('../../migrations/', import.meta.url);

// vitest's (vite 6) resolver does not know `node:sqlite` as a builtin and tries
// to load it as a file ("Failed to load url sqlite"), so ask the runtime for it.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');

type Row = Record<string, unknown>;

function open(): Db {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(migrations).sort()) {
    db.exec(readFileSync(new URL(f, migrations), 'utf8'));
  }
  db.exec(readFileSync(new URL('fixture.sql', import.meta.url), 'utf8'));
  return db;
}

function run(name: string): Row[] {
  return open().prepare(loadSql(name)).all() as Row[];
}

const byKey = (rows: Row[], key: string) =>
  Object.fromEntries(rows.map((r) => [String(r[key]), r])) as Record<string, Row>;

describe('summary.sql', () => {
  const rows = run('summary');
  const m = byKey(rows, 'metric');
  const pick = (prefix: string) => {
    const hit = Object.keys(m).find((k) => k.startsWith(prefix));
    if (!hit) throw new Error(`metric not found: ${prefix}`);
    return m[hit];
  };

  it('counts every kind of device the fixture contains', () => {
    expect(rows).toHaveLength(8);
    expect(pick('登録端末').devices).toBe(6);
    expect(pick('投稿端末')).toMatchObject({ devices: 5, n: 7 });
    expect(pick('計測端末')).toMatchObject({ devices: 2, n: 5 });
    expect(pick('フォーム到達端末')).toMatchObject({ devices: 2, n: 2 });
    expect(pick('和集合（users').devices).toBe(7);
    expect(pick('ご意見')).toMatchObject({ devices: 1, n: 1 });
    expect(pick('通知購読')).toMatchObject({ devices: 2, n: 2 });
    expect(pick('和集合（全テーブル').devices).toBe(8);
  });

  it('dates in JST', () => {
    expect(pick('登録端末').first_jst).toBe('2026-08-07 10:00');
  });
});

describe('breakdown.sql', () => {
  const b = byKey(run('breakdown'), 'kind');

  it('classifies postings by group, drinks first', () => {
    // H's four history rows (group_id NULL, one instant) are one 作れた; the
    // machine rows inside drink postings must not count as マシン.
    expect(b['ドリンク報告（作れた）']).toMatchObject({ n: 3, devices: 2 });
    expect(b['ドリンク報告（作れなかった）']).toMatchObject({ n: 1, devices: 1 });
    expect(b['目撃（材料の残量）']).toMatchObject({ n: 1, devices: 1 });
    expect(b['マシン']).toMatchObject({ n: 1, devices: 1 });
    expect(b['行列']).toMatchObject({ n: 1, devices: 1 });
    expect(b['ご意見']).toMatchObject({ n: 1, devices: 1 });
    expect(b['通知購読（現存する購読）']).toMatchObject({ n: 2, devices: 2 });
  });
});

describe('trend.sql', () => {
  const rows = run('trend');
  const day = byKey(
    rows.filter((r) => r.grain === '日'),
    'period',
  );
  const week = byKey(
    rows.filter((r) => r.grain === '週'),
    'period',
  );

  it('puts a device in the day it first left any trace', () => {
    expect(day['2026-08-14']).toMatchObject({
      new_users: 1,
      new_seen: 1,
      active: 1,
      posters: 1,
      postings: 1,
      form_viewers: 1,
      events: 3,
    });
  });

  it('counts an events-only device as seen and active but not a poster', () => {
    expect(day['2026-08-26']).toMatchObject({
      new_users: 0,
      new_seen: 1,
      active: 1,
      posters: 0,
      postings: 0,
      form_viewers: 1,
      events: 2,
    });
  });

  it('counts a feedback-only device as new but not active', () => {
    expect(day['2026-09-01']).toMatchObject({ new_users: 1, new_seen: 1, active: 0, postings: 0 });
  });

  it('emits quiet days as zeros rather than dropping them', () => {
    expect(day['2026-08-09']).toMatchObject({ new_users: 0, active: 0, postings: 0, events: 0 });
    expect(day['2026-08-09'].dow).toBe('日');
  });

  it('rolls days up into Monday-based weeks', () => {
    expect(week['2026-08-10']).toMatchObject({
      new_users: 2,
      new_seen: 2,
      active: 2,
      posters: 2,
      postings: 2,
      form_viewers: 1,
      events: 3,
    });
  });
});

describe('detail.sql', () => {
  const rows = run('detail');

  it('lists every device once, labels only, and nothing the public log must not carry', () => {
    expect(rows).toHaveLength(8);
    expect(Object.keys(rows[0])).toEqual(['label', 'first_jst', 'last_jst', 'postings', 'events', 'form_views']);
    for (const col of Object.keys(rows[0])) expect(FORBIDDEN_COLUMNS).not.toContain(col);
    const l = byKey(rows, 'label');
    expect(l['利用者H'].postings).toBe(1);
    expect(l['利用者B']).toMatchObject({ postings: 2, events: 3, form_views: 1 });
    expect(rows.filter((r) => String(r.label).startsWith('（ラベルなし')).length).toBe(2);
  });

  it('never leaks the feedback body through any query', () => {
    for (const name of ['summary', 'trend', 'breakdown', 'detail']) {
      expect(JSON.stringify(run(name))).not.toContain('本文は出力に現れてはいけない');
    }
  });
});

describe('renderMarkdown', () => {
  it('refuses to print a forbidden column', () => {
    expect(() =>
      renderMarkdown('summary', [{ results: [{ user_id: 'x', n: 1 }], success: true, meta: {} }]),
    ).toThrow(/user_id/);
  });

  it('escapes pipes and says so when there are no rows', () => {
    const md = renderMarkdown('breakdown', [
      { results: [{ kind: 'a|b', n: 1 }], success: true, meta: { rows_read: 4 } },
      { results: [], success: true, meta: {} },
    ]);
    expect(md).toContain('| a\\|b | 1 |');
    expect(md).toContain('rows_read 4');
    expect(md).toContain('_(0 行)_');
  });
});
