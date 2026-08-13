import { describe, expect, it } from 'vitest';
import type { Report, ReportRowValue, ReportSubject } from '../../shared/domain.js';
import { advanceWatermark, buildNotificationBody, collapsePostings } from './notifyLogic.js';

const T0 = 1_700_000_000_000;

let seq = 0;
function report(
  subject: ReportSubject,
  action: ReportRowValue,
  userId: string,
  at: number,
  id?: string,
): Report {
  return {
    id: id ?? `r${seq++}`,
    subject,
    action,
    userId,
    userLabel: userId === 'me' ? '利用者（あなた）' : `利用者${userId.toUpperCase()}`,
    createdAt: at,
  };
}

describe('advanceWatermark', () => {
  it('treats the first sight of data as baseline, never as news', () => {
    const seeds = [
      report('coffeeBeans', 'available', 'a', T0 - 60_000),
      report('cocoaPowder', 'low', 'b', T0 - 30_000),
    ];
    const r = advanceWatermark(seeds, 'me', null);
    expect(r.fresh).toEqual([]);
    expect(r.watermark).toBe(T0 - 30_000);
  });

  it('baselines an empty board to zero so the first real post still counts', () => {
    const first = advanceWatermark([], 'me', null);
    expect(first.watermark).toBe(0);
    const next = advanceWatermark([report('ice', 'refilled', 'a', T0)], 'me', first.watermark);
    expect(next.fresh).toHaveLength(1);
  });

  it('surfaces only reports newer than the mark, newest first', () => {
    const reports = [
      report('coffeeBeans', 'available', 'a', T0 - 60_000), // old
      report('cocoaPowder', 'low', 'b', T0 + 10_000),
      report('ice', 'unavailable', 'c', T0 + 20_000),
    ];
    const r = advanceWatermark(reports, 'me', T0);
    expect(r.fresh.map((f) => f.subject)).toEqual(['ice', 'cocoaPowder']);
    expect(r.watermark).toBe(T0 + 20_000);
  });

  it('never notifies about my own posts, confirmed or optimistic', () => {
    const reports = [
      report('milkPowder', 'refilled', 'me', T0 + 5_000),
      report('milkPowder', 'refilled', 'me', T0 + 6_000, 'pending-abc'),
    ];
    const r = advanceWatermark(reports, 'me', T0);
    expect(r.fresh).toEqual([]);
    // The confirmed post advances the mark; the optimistic one must not —
    // its timestamp is a client-side guess, not a server time.
    expect(r.watermark).toBe(T0 + 5_000);
  });

  it('does not let an optimistic row mask a colleague post it raced past', () => {
    // My tap at ~T0+25s goes optimistic while a colleague's server-side post
    // at T0+20s is still unfetched. If the guess advanced the mark, the
    // colleague's post would arrive already "old" and never notify.
    const withPending = [report('ice', 'refilled', 'me', T0 + 25_000, 'pending-1')];
    const step1 = advanceWatermark(withPending, 'me', T0);
    expect(step1.watermark).toBe(T0);

    const nextPoll = [report('cocoaPowder', 'unavailable', 'b', T0 + 20_000)];
    const step2 = advanceWatermark(nextPoll, 'me', step1.watermark);
    expect(step2.fresh).toHaveLength(1);
    expect(step2.fresh[0].subject).toBe('cocoaPowder');
  });

  it('skips optimistic rows even if the identity is not resolved yet', () => {
    const r = advanceWatermark(
      [report('ice', 'low', 'someone-else', T0 + 1_000, 'pending-x')],
      'me',
      T0,
    );
    expect(r.fresh).toEqual([]);
  });

  it('holds the mark when the list shrinks (undo)', () => {
    const r = advanceWatermark([report('coffeeBeans', 'available', 'a', T0 - 60_000)], 'me', T0);
    expect(r.watermark).toBe(T0);
    expect(r.fresh).toEqual([]);
  });

  it('is idempotent across repeated calls with the same data', () => {
    const reports = [report('cocoaPowder', 'low', 'b', T0 + 10_000)];
    const first = advanceWatermark(reports, 'me', T0);
    expect(first.fresh).toHaveLength(1);
    const second = advanceWatermark(reports, 'me', first.watermark);
    expect(second.fresh).toEqual([]);
  });
});

describe('collapsePostings', () => {
  it('keeps one row per posting, preferring the drink row', () => {
    // One drink posting fanned out into four rows at the same instant.
    const fanned = [
      report('iceCoffee', 'made', 'a', T0),
      report('coffeeBeans', 'available', 'a', T0),
      report('ice', 'available', 'a', T0),
      report('machine', 'available', 'a', T0),
    ];
    const collapsed = collapsePostings(fanned);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].subject).toBe('iceCoffee');
  });

  it('leaves standalone reports intact and preserves order', () => {
    const rows = [
      report('queue', 'empty', 'b', T0 + 2000),
      report('iceCoffee', 'made', 'a', T0 + 1000),
      report('coffeeBeans', 'available', 'a', T0 + 1000),
      report('milkPowder', 'refilled', 'c', T0),
    ];
    const collapsed = collapsePostings(rows);
    expect(collapsed.map((r) => r.subject)).toEqual(['queue', 'iceCoffee', 'milkPowder']);
  });

  it('does not merge different people posting at the same instant', () => {
    const rows = [
      report('hotCocoa', 'made', 'a', T0),
      report('hotCocoa', 'made', 'b', T0),
    ];
    expect(collapsePostings(rows)).toHaveLength(2);
  });
});

describe('buildNotificationBody', () => {
  it('names the poster, subject, and what they said for a single report', () => {
    const body = buildNotificationBody([report('cocoaPowder', 'unavailable', 'b', T0)]);
    expect(body).toBe('利用者Bさんが ココア「作れない」 と投稿しました');
  });

  it('uses the refill wording for refills', () => {
    const body = buildNotificationBody([report('ice', 'refilled', 'c', T0)]);
    expect(body).toContain('氷「補充された」');
  });

  it('speaks queue levels in queue vocabulary', () => {
    const body = buildNotificationBody([report('queue', 'long', 'd', T0)]);
    expect(body).toContain('行列「6人以上」');
  });

  it('collapses a burst into one line led by the newest report', () => {
    const fresh = [
      report('ice', 'unavailable', 'c', T0 + 2_000),
      report('cocoaPowder', 'low', 'b', T0 + 1_000),
    ];
    const body = buildNotificationBody(fresh);
    expect(body).toBe('新しい投稿が2件あります。最新: 氷「作れない」');
  });
});
