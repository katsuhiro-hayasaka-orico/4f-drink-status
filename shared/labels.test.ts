import { describe, expect, it } from 'vitest';
import {
  MATERIAL_KEYS,
  SIGHTING_ACTIONS,
  SIGHTING_LEVELS,
  actionLabelFor,
  isEventName,
  isSightingLevel,
  isValidReportValue,
  reportValueQuote,
} from './domain.js';

describe('清掃中 (machine-only cleaning)', () => {
  it('is valid only for the machine', () => {
    expect(isValidReportValue('machine', 'cleaning')).toBe(true);
    expect(isValidReportValue('coffeeBeans', 'cleaning')).toBe(false);
    expect(isValidReportValue('ice', 'cleaning')).toBe(false);
    expect(isValidReportValue('queue', 'cleaning')).toBe(false);
  });

  it('labels and quotes as 清掃中', () => {
    expect(actionLabelFor('machine', 'cleaning')).toBe('清掃中');
    expect(reportValueQuote('machine', 'cleaning')).toBe('清掃中');
  });
});

describe('actionLabelFor', () => {
  it('words material states as stock levels', () => {
    expect(actionLabelFor('coffeeBeans', 'available')).toBe('十分にある');
    expect(actionLabelFor('ice', 'low')).toBe('残り少なめ');
    expect(actionLabelFor('milkPowder', 'unavailable')).toBe('なくなっている');
    expect(actionLabelFor('cocoaPowder', 'refilled')).toBe('補充された');
  });

  it('words machine states as working or broken, not stocked or empty', () => {
    expect(actionLabelFor('machine', 'available')).toBe('正常に使えた');
    expect(actionLabelFor('machine', 'low')).toBe('調子が悪い');
    expect(actionLabelFor('machine', 'unavailable')).toBe('使えない・故障');
    expect(actionLabelFor('machine', 'refilled')).toBe('復旧した');
  });

  it('leaves queue levels on their head-count wording', () => {
    expect(actionLabelFor('queue', 'empty')).toBe('誰も並んでいない');
    expect(actionLabelFor('queue', 'long')).toBe('6人以上待ち');
  });
});

describe('isEventName', () => {
  it('accepts exactly the allowlisted metric events', () => {
    expect(isEventName('cta_click')).toBe(true);
    expect(isEventName('report_view')).toBe(true);
    expect(isEventName('post_done')).toBe(true);
    expect(isEventName('post_undone')).toBe(true);

    // The allowlist is the privacy policy: nothing free-form gets stored.
    expect(isEventName('pageview')).toBe(false);
    expect(isEventName('')).toBe(false);
    expect(isEventName(undefined)).toBe(false);
    expect(isEventName(42)).toBe(false);
  });
});

describe('SIGHTING_ACTIONS', () => {
  it('lets a bystander report every material in every offered state', () => {
    for (const material of MATERIAL_KEYS) {
      for (const action of SIGHTING_ACTIONS) {
        expect(isValidReportValue(material, action), `${material}/${action}`).toBe(true);
        expect(actionLabelFor(material, action), `${material}/${action}`).not.toBe('');
      }
    }
  });

  it('offers 十分にある — leaving it out is what pushed people to fake drinks', () => {
    // Someone who could see three full hoppers had no way to say so, so they
    // posted cocoa and lattes they had not made just to record the levels.
    expect(SIGHTING_ACTIONS).toContain('available');
    expect(SIGHTING_ACTIONS).toContain('low');
    expect(SIGHTING_ACTIONS).toContain('refilled');
  });

  it('withholds なくなっている from witnesses on purpose', () => {
    // Calling a hopper empty is a claim only the person who actually tried can
    // make; that stays with the failure report, where a cause must be named.
    expect(SIGHTING_ACTIONS).not.toContain('unavailable');
  });
});

describe('SIGHTING_LEVELS', () => {
  it('offers four bands, every one of them a state a witness may report', () => {
    expect(SIGHTING_LEVELS).toHaveLength(4);
    for (const band of SIGHTING_LEVELS) {
      expect(SIGHTING_ACTIONS, band.key).toContain(band.action);
      expect(band.action, band.key).not.toBe('unavailable');
    }
  });

  it('covers the sighting vocabulary exactly, with 補充された as the separate button', () => {
    // The bands plus the refill chip account for every action a witness may
    // post — no state quietly dropped out of reach when the form changed.
    const reachable = new Set([...SIGHTING_LEVELS.map((b) => b.action), 'refilled']);
    expect([...reachable].sort()).toEqual([...SIGHTING_ACTIONS].sort());
  });

  it('descends, and stops at the floor a witness may claim', () => {
    expect(SIGHTING_LEVELS.map((b) => b.level)).toEqual([95, 60, 30, 10]);
    // 10, not 0: 「ほとんどない」 is as far as looking can take you.
    for (const band of SIGHTING_LEVELS) {
      expect(Number.isInteger(band.level), band.key).toBe(true);
      expect(band.level, band.key).toBeGreaterThanOrEqual(10);
      expect(band.level, band.key).toBeLessThanOrEqual(100);
    }
  });

  it('maps the top two onto 取れた and the bottom two onto 残り少なめ', () => {
    expect(SIGHTING_LEVELS.filter((b) => b.action === 'available').map((b) => b.key)).toEqual([
      'full',
      'half',
    ]);
    expect(SIGHTING_LEVELS.filter((b) => b.action === 'low').map((b) => b.key)).toEqual([
      'low',
      'trace',
    ]);
  });

  it('keeps every label and quote distinct and non-empty', () => {
    expect(new Set(SIGHTING_LEVELS.map((b) => b.label)).size).toBe(4);
    expect(new Set(SIGHTING_LEVELS.map((b) => b.quote)).size).toBe(4);
    for (const band of SIGHTING_LEVELS) {
      expect(band.label, band.key).not.toBe('');
      expect(band.quote, band.key).not.toBe('');
    }
  });
});

describe('isSightingLevel', () => {
  it('accepts every band on every material, and a refill at full', () => {
    for (const material of MATERIAL_KEYS) {
      for (const band of SIGHTING_LEVELS) {
        expect(isSightingLevel(material, band.action, band.level), `${material}/${band.key}`).toBe(
          true,
        );
      }
      expect(isSightingLevel(material, 'refilled', 100)).toBe(true);
    }
  });

  it('refuses a level its action never offered', () => {
    expect(isSightingLevel('coffeeBeans', 'available', 10)).toBe(false);
    expect(isSightingLevel('coffeeBeans', 'low', 95)).toBe(false);
    expect(isSightingLevel('coffeeBeans', 'refilled', 95)).toBe(false);
  });

  it('leaves no way to report a hopper empty by the back door', () => {
    // A range check would have accepted these; the allowlist is what makes 10
    // the floor rather than a convention.
    expect(isSightingLevel('coffeeBeans', 'low', 0)).toBe(false);
    expect(isSightingLevel('coffeeBeans', 'unavailable', 0)).toBe(false);
  });

  it('is for materials only', () => {
    expect(isSightingLevel('machine', 'available', 60)).toBe(false);
    expect(isSightingLevel('machine', 'refilled', 100)).toBe(false);
    expect(isSightingLevel('queue', 'short', 60)).toBe(false);
  });

  it('rejects anything that is not one of the stored numbers', () => {
    expect(isSightingLevel('ice', 'low', 101)).toBe(false);
    expect(isSightingLevel('ice', 'low', -1)).toBe(false);
    expect(isSightingLevel('ice', 'available', 60.5)).toBe(false);
    expect(isSightingLevel('ice', 'available', '60')).toBe(false);
    expect(isSightingLevel('ice', 'available', null)).toBe(false);
    expect(isSightingLevel('ice', 'available', undefined)).toBe(false);
  });
});

describe('reportValueQuote with a level', () => {
  it('quotes the band that was pressed', () => {
    expect(reportValueQuote('coffeeBeans', 'available', 95)).toBe('たっぷり');
    expect(reportValueQuote('coffeeBeans', 'available', 60)).toBe('半分くらい');
    expect(reportValueQuote('ice', 'low', 30)).toBe('少なめ');
    expect(reportValueQuote('ice', 'low', 10)).toBe('ほとんどない');
  });

  it('falls back to the action when the row carries no level', () => {
    // Drink-expanded votes and everything posted before the bands existed.
    expect(reportValueQuote('ice', 'low')).toBe('残り少なめ');
    expect(reportValueQuote('ice', 'available')).toBe('取れた');
    expect(reportValueQuote('ice', 'low', null)).toBe('残り少なめ');
  });

  it('leaves refills, machines, queues and drinks on their own wording', () => {
    expect(reportValueQuote('milkPowder', 'refilled', 100)).toBe('補充された');
    expect(reportValueQuote('machine', 'available', 95)).toBe('取れた');
    expect(reportValueQuote('queue', 'long', 60)).toBe('6人以上');
    expect(reportValueQuote('hotCoffee', 'made', 95)).toBe('作れた');
  });
});
