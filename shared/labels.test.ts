import { describe, expect, it } from 'vitest';
import {
  MATERIAL_KEYS,
  SIGHTING_ACTIONS,
  actionLabelFor,
  isEventName,
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
