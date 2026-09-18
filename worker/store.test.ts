import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contributorWindowStart } from '../shared/contributors.js';
import { CONTRIBUTORS_SQL } from './store.js';

/**
 * The Worker's SQL, against a real SQLite.
 *
 * CONTRIBUTORS_SQL counts three different things over the same rows — postings
 * (groups, with a pre-0005 fallback), JST days, and postings inside the window
 * — and none of that is visible from the TypeScript around it. So the real
 * migrations are applied to an in-memory database and the exported statement
 * is run verbatim, the way scripts/stats/stats.test.ts pins the Stats SQL.
 *
 * node:sqlite ships with Node 22.13+ (CI pins 22). vitest's (vite 6) resolver
 * does not know it as a builtin and tries to load it as a file, hence
 * getBuiltinModule; this file is type-checked by tsconfig.worker.json, whose
 * lib is the Workers runtime, so the handle is cast rather than imported.
 */
const { DatabaseSync } = (
  process as unknown as { getBuiltinModule(id: string): typeof import('node:sqlite') }
).getBuiltinModule('node:sqlite');

// A path string, not a URL: this file is type-checked against the Workers
// lib, whose URL is not Node's, and fs rejects the mismatch.
const migrations = fileURLToPath(new URL('../migrations/', import.meta.url).href);

/** Epoch milliseconds for a JST wall-clock time — the clock the counts use. */
function jst(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour - 9, minute);
}

/** 2026-09-18 14:00 JST. The window then opens on 2026-08-20 00:00 JST. */
const NOW = jst(2026, 9, 18, 14);
const WINDOW_START = contributorWindowStart(NOW);

interface Seed {
  id: string;
  user: string;
  at: number;
  group?: string | null;
}

const SEED: Seed[] = [
  // One drink report: five rows, one group id, one created_at — one posting.
  ...['drink', 'beans', 'milk', 'ice', 'machine'].map((part, i) => ({
    id: `a-g1-${i}`,
    user: 'u-a',
    at: jst(2026, 9, 18, 10),
    group: 'g1',
    subject: part,
  })),
  // Two separate single-row postings on the same earlier day.
  { id: 'a-2', user: 'u-a', at: jst(2026, 9, 17, 9), group: 'a-2' },
  { id: 'a-3', user: 'u-a', at: jst(2026, 9, 17, 16), group: 'a-3' },

  // Pre-0005 rows: no group id at all. The two sharing a created_at were one
  // posting back then and still count as one.
  { id: 'b-1', user: 'u-b', at: jst(2026, 9, 16, 11), group: null },
  { id: 'b-2', user: 'u-b', at: jst(2026, 9, 16, 11), group: null },
  { id: 'b-3', user: 'u-b', at: jst(2026, 9, 16, 15), group: null },
  // Long before the window — all-time only.
  { id: 'b-4', user: 'u-b', at: jst(2026, 7, 1, 10), group: null },

  // Either side of JST midnight: one UTC day, two JST days.
  { id: 'c-1', user: 'u-c', at: jst(2026, 9, 17, 23, 30), group: 'c-1' },
  { id: 'c-2', user: 'u-c', at: jst(2026, 9, 18, 0, 30), group: 'c-2' },

  // The window's own edge: the first instant is inside it, a millisecond
  // earlier is not.
  { id: 'd-1', user: 'u-d', at: WINDOW_START, group: 'd-1' },
  { id: 'd-2', user: 'u-d', at: WINDOW_START - 1, group: 'd-2' },
];

interface Row {
  user_id: string;
  label: string;
  postings: number;
  recent_days: number;
  recent_postings: number;
}

function open() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(migrations).sort()) {
    db.exec(readFileSync(`${migrations}${file}`, 'utf8'));
  }
  const insert = db.prepare(
    `INSERT INTO reports (id, subject, action, user_id, user_label, created_at, group_id)
     VALUES (?, 'coffeeBeans', 'available', ?, ?, ?, ?)`,
  );
  for (const row of SEED) {
    insert.run(row.id, row.user, `利用者${row.user}`, row.at, row.group ?? null);
  }
  return db;
}

function tally(): Record<string, Row> {
  const rows = open().prepare(CONTRIBUTORS_SQL).all(WINDOW_START) as unknown as Row[];
  return Object.fromEntries(rows.map((r) => [r.user_id, r]));
}

describe('CONTRIBUTORS_SQL', () => {
  const byUser = tally();

  it('counts one posting per group, not one per row', () => {
    // Five rows of one drink report, plus two singles.
    expect(byUser['u-a']).toMatchObject({ postings: 3, recent_postings: 3, recent_days: 2 });
  });

  it('counts pre-0005 rows by (user, timestamp), the posting they used to be', () => {
    // b-1 and b-2 share a created_at — one posting. b-3 is a second. b-4 is a
    // third, but it is older than the window.
    expect(byUser['u-b']).toMatchObject({ postings: 3, recent_postings: 2, recent_days: 1 });
  });

  it('splits days on JST midnight, not UTC', () => {
    // Both rows fall on 2026-09-17 in UTC; in Tokyo they are two days.
    expect(byUser['u-c']).toMatchObject({ postings: 2, recent_postings: 2, recent_days: 2 });
  });

  it('includes the first instant of the window and excludes the one before', () => {
    expect(byUser['u-d']).toMatchObject({ postings: 2, recent_postings: 1, recent_days: 1 });
  });

  it('carries the display label through', () => {
    expect(byUser['u-a'].label).toBe('利用者u-a');
    expect(Object.keys(byUser).sort()).toEqual(['u-a', 'u-b', 'u-c', 'u-d']);
  });

  it('runs off the index migration 0008 adds', () => {
    // Without idx_reports_user_created_at the GROUP BY scans and sorts the
    // whole table; this is the cheapest way to notice if the index is dropped.
    const plan = open()
      .prepare(`EXPLAIN QUERY PLAN ${CONTRIBUTORS_SQL}`)
      .all(WINDOW_START)
      .map((r) => String((r as { detail: string }).detail))
      .join(' | ');
    expect(plan).toContain('idx_reports_user_created_at');
  });
});
