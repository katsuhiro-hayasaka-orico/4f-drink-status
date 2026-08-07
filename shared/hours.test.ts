import { describe, expect, it } from 'vitest';
import { formatDuration, jstClock, jstTimeLabel, loungeHours } from './hours.js';

/** Build an epoch timestamp for a given JST wall-clock time. */
function jst(hour: number, minute = 0): number {
  return Date.UTC(2026, 0, 15, hour - 9, minute);
}

describe('jstClock', () => {
  it('reads the Tokyo wall clock regardless of the host timezone', () => {
    expect(jstClock(jst(9, 30))).toMatchObject({ hour: 9, minute: 30 });
    expect(jstClock(jst(0, 0))).toMatchObject({ hour: 0, minute: 0 });
    expect(jstClock(jst(23, 59))).toMatchObject({ hour: 23, minute: 59 });
  });

  it('is not affected by the machine running on UTC', () => {
    // 00:00 UTC is 09:00 JST — the moment the lounge opens.
    expect(jstClock(Date.UTC(2026, 0, 15, 0, 0)).hour).toBe(9);
  });
});

describe('loungeHours', () => {
  it('is closed before opening, and counts down to it', () => {
    const h = loungeHours(jst(7, 30));
    expect(h.state).toBe('closed');
    expect(h.badge).toBe('時間外');
    expect(h.note).toContain('9:00に開きます');
    expect(h.note).toContain('1時間30分');
  });

  it('opens exactly at 9:00', () => {
    expect(loungeHours(jst(8, 59)).state).toBe('closed');
    expect(loungeHours(jst(9, 0)).state).toBe('open');
  });

  it('closes exactly at 17:00', () => {
    expect(loungeHours(jst(16, 59)).state).toBe('closingSoon');
    expect(loungeHours(jst(17, 0)).state).toBe('closed');
  });

  it('warns for the last 30 minutes, not before', () => {
    expect(loungeHours(jst(16, 29)).state).toBe('open');
    expect(loungeHours(jst(16, 30)).state).toBe('closingSoon');
    expect(loungeHours(jst(16, 45)).note).toContain('15分');
  });

  it('points at tomorrow once the day is done', () => {
    const h = loungeHours(jst(18, 0));
    expect(h.state).toBe('closed');
    expect(h.note).toContain('明日');
  });

  it('reports minutes left only while open', () => {
    expect(loungeHours(jst(12, 0)).minutesToClose).toBe(300);
    expect(loungeHours(jst(3, 0)).minutesToClose).toBeNull();
    expect(loungeHours(jst(22, 0)).minutesToClose).toBeNull();
  });

  it('always states the opening hours', () => {
    for (const hour of [0, 9, 13, 17, 23]) {
      expect(loungeHours(jst(hour)).rangeLabel).toBe('9:00–17:00');
    }
  });
});

describe('formatDuration', () => {
  it('drops the hour when there is none, and the minutes when they are zero', () => {
    expect(formatDuration(1)).toBe('1分');
    expect(formatDuration(59)).toBe('59分');
    expect(formatDuration(60)).toBe('1時間');
    expect(formatDuration(90)).toBe('1時間30分');
    expect(formatDuration(120)).toBe('2時間');
  });
});

describe('jstTimeLabel', () => {
  it('zero-pads to a stable width', () => {
    expect(jstTimeLabel(jst(9, 5))).toBe('09:05');
    expect(jstTimeLabel(jst(16, 30))).toBe('16:30');
  });
});
