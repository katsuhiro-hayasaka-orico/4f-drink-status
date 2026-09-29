import { describe, expect, it } from 'vitest';
import { overallState } from '../../shared/aggregate.js';
import {
  SUBJECT_LABELS,
  SUPPLY_SUBJECT_KEYS,
  type StatusOrNone,
  type SupplySubjectKey,
} from '../../shared/domain.js';
import { KNOWN_HEADLINES, headlinePhrases, splitPhrases } from './phrases.js';

const STATES: StatusOrNone[] = ['available', 'low', 'unavailable', 'none'];

/** Every headline overallState can produce: all 4^5 status mixes, cleaning or not. */
function everyVerdictLabel(): Set<string> {
  const labels = new Set<string>();
  const total = STATES.length ** SUPPLY_SUBJECT_KEYS.length;
  for (let n = 0; n < total; n++) {
    let rest = n;
    const statuses = {} as Record<SupplySubjectKey, StatusOrNone>;
    for (const key of SUPPLY_SUBJECT_KEYS) {
      statuses[key] = STATES[rest % STATES.length];
      rest = Math.floor(rest / STATES.length);
    }
    for (const cleaning of [false, true]) {
      labels.add(overallState(statuses, SUBJECT_LABELS, cleaning).label);
    }
  }
  return labels;
}

describe('headline phrases', () => {
  it('lists every headline overallState can produce', () => {
    // A new verdict in shared/aggregate.ts renders fine without an entry, but
    // breaks per character on a phone; this is what notices.
    const missing = [...everyVerdictLabel()].filter((l) => !KNOWN_HEADLINES.includes(l));
    expect(missing).toEqual([]);
  });

  it("lists SummaryPanel's and App's own headlines", () => {
    for (const text of ['いまは閉まっています', '最新の状況を確認しています', '状況を取得できていません']) {
      expect(KNOWN_HEADLINES, text).toContain(text);
    }
  });

  it('never changes the text, only where it may break', () => {
    for (const text of KNOWN_HEADLINES) {
      expect(headlinePhrases(text).join(''), text).toBe(text);
    }
  });

  it('passes an unlisted headline through whole', () => {
    expect(headlinePhrases('新しい見出し')).toEqual(['新しい見出し']);
  });

  it('splits on the marker and drops empty parts', () => {
    expect(splitPhrases('いま|飲めます')).toEqual(['いま', '飲めます']);
    expect(splitPhrases('|a||b|')).toEqual(['a', 'b']);
  });
});
