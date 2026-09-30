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

function open(withFixture = true): Db {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(migrations).sort()) {
    db.exec(readFileSync(new URL(f, migrations), 'utf8'));
  }
  if (withFixture) db.exec(readFileSync(new URL('fixture.sql', import.meta.url), 'utf8'));
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

describe('retention.sql', () => {
  // Fix the SQL clock: the current week must stay provisional on future CI runs.
  const sql = loadSql('retention').replaceAll("'now'", "'2026-09-30T06:02:25Z'");
  function sample(): Row[] {
    const db = open(false);
    const insert = db.prepare(
      'INSERT INTO reports (id, subject, action, user_id, user_label, created_at, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    let n = 0;
    const post = (user: string, at: string, group: string | null = null) =>
      insert.run(`retfx-${++n}`, 'machine', 'available', user, '非公開ラベル', Date.parse(at), group);
    post('retfx-C', '2026-08-24T01:00:00Z');
    post('retfx-A', '2026-08-31T01:00:00Z', 'expanded');
    post('retfx-A', '2026-08-31T01:00:00Z', 'expanded');
    post('retfx-A', '2026-09-01T01:00:00Z');
    post('retfx-B', '2026-09-06T14:59:59Z'); // Sunday 23:59:59 JST
    post('retfx-A', '2026-09-06T15:00:00Z'); // Monday 00:00 JST
    post('retfx-D', '2026-09-08T01:00:00Z'); // first report, not a return
    post('retfx-C', '2026-09-10T01:00:00Z'); // returning after a gap
    post('retfx-A', '2026-09-14T01:00:00Z');
    post('retfx-D', '2026-09-14T01:00:00Z');
    // 9/21 is quiet. A returns after that empty week; E is new.
    post('retfx-A', '2026-09-28T01:00:00Z');
    post('retfx-E', '2026-09-30T01:00:00Z');
    post('retfx-F', '2026-10-05T01:00:00Z'); // future week must not appear
    db.exec(`
      INSERT INTO events VALUES ('retfx-event', 'report_view', NULL, 'events-only', 1788742800000);
      INSERT INTO feedback (id, mood, body, user_id, user_label, created_at)
      VALUES ('retfx-feedback', 'happy', '秘密の本文', 'feedback-only', '秘密のラベル', 1788742800000);
    `);
    try {
      return db.prepare(sql).all() as Row[];
    } finally {
      db.close();
    }
  }
  const rows = sample();
  const week = byKey(rows, 'week');

  it('counts shared posters once, including historical and expanded reports, in JST weeks', () => {
    expect(week['2026-09-07']).toMatchObject({
      prev_week: '2026-08-31', status: '確定', prev_posters: 2, posters: 3,
      retained: 1, retention_pct: 50, returning_posters: 1,
    });
    expect(week['2026-09-14']).toMatchObject({ prev_posters: 3, posters: 2, retained: 2, retention_pct: 66.7, returning_posters: 0 });
  });

  it('keeps quiet weeks and does not treat non-adjacent weeks as retention', () => {
    expect(week['2026-09-21']).toMatchObject({ prev_posters: 2, posters: 0, retained: 0, retention_pct: 0, returning_posters: 0 });
    expect(week['2026-09-28']).toMatchObject({ prev_posters: 0, posters: 2, retained: 0, retention_pct: null, returning_posters: 1 });
  });

  it('marks only the current week provisional and leaves a zero denominator undefined', () => {
    expect(rows.filter((r) => r.status === '途中').map((r) => r.week)).toEqual(['2026-09-28']);
    expect(week['2026-08-03']).toMatchObject({ prev_posters: 0, retention_pct: null });
    expect(week['2026-10-05']).toBeUndefined();
  });

  it('keeps posters consistent with trend on the shared fixture', () => {
    const db = open();
    const trendSql = loadSql('trend').replaceAll("'now'", "'2026-09-30T06:02:25Z'");
    const trend = byKey((db.prepare(trendSql).all() as Row[]).filter((r) => r.grain === '週'), 'period');
    for (const r of db.prepare(sql).all() as Row[]) expect(r.posters).toBe(trend[String(r.week)].posters);
    db.close();
  });

  it('handles an empty reports table without counting events or feedback', () => {
    const db = open();
    db.exec('DELETE FROM reports');
    const empty = db.prepare(sql).all() as Row[];
    db.close();
    expect(empty.length).toBeGreaterThan(0);
    for (const r of empty) expect(r).toMatchObject({ posters: 0, prev_posters: 0, retained: 0, retention_pct: null, returning_posters: 0 });
  });

  it('renders only aggregate counts and dates in the public summary', () => {
    expect(Object.keys(rows[0])).toEqual(['week', 'prev_week', 'status', 'prev_posters', 'posters', 'retained', 'retention_pct', 'returning_posters']);
    const md = renderMarkdown('retention', [{ results: rows, meta: {} }]);
    expect(md).toContain('投稿端末の週次継続');
    expect(md).toContain('| 2026-09-28 | 2026-09-21 | 途中 | 0 | 2 | 0 |  | 1 |');
    expect(md).not.toMatch(/retfx-|events-only|feedback-only|秘密|非公開/);
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
    for (const name of ['summary', 'trend', 'retention', 'breakdown', 'detail']) {
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
