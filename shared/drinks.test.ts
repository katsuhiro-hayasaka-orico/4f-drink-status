import { describe, expect, it } from 'vitest';
import { RECIPES, drinkAvailability } from './drinks.js';
import type { StatusOrNone, SupplySubjectKey } from './domain.js';

const iceCoffee = RECIPES.find((r) => r.name === 'アイスコーヒー')!;
const mocha = RECIPES.find((r) => r.name === 'カフェモカ')!;

function statuses(
  overrides: Partial<Record<SupplySubjectKey, StatusOrNone>>,
): Record<SupplySubjectKey, StatusOrNone> {
  return {
    coffeeBeans: 'available',
    cocoaPowder: 'available',
    milkPowder: 'available',
    ice: 'available',
    machine: 'available',
    ...overrides,
  };
}

describe('drinkAvailability', () => {
  it('says 作れます when everything required is confirmed', () => {
    const d = drinkAvailability(mocha, statuses({}));
    expect(d.status).toBe('available');
  });

  it('refuses to vouch for an unreported requirement', () => {
    const d = drinkAvailability(iceCoffee, statuses({ ice: 'none' }));
    expect(d.status).toBe('none');
    expect(d.stateText).toBe('まだわかりません');
    expect(d.mark).toBe('?');
  });

  it('ranks certainty above ignorance', () => {
    // Beans are confirmed gone: the answer is already decided, however little
    // is known about the ice.
    const d = drinkAvailability(iceCoffee, statuses({ coffeeBeans: 'unavailable', ice: 'none' }));
    expect(d.status).toBe('unavailable');
    expect(d.reason).toContain('コーヒー豆');
  });

  it('a broken machine outranks everything, including ignorance', () => {
    const d = drinkAvailability(mocha, statuses({ machine: 'unavailable', cocoaPowder: 'none' }));
    expect(d.status).toBe('unavailable');
    expect(d.reason).toBe('マシンが止まっています');
  });

  it('stays at 情報なし while any requirement is unreported, even next to a low', () => {
    // 残り少なめ still promises 「作れる」, and that promise covers every
    // ingredient — including the unreported one. Only a confirmed 作れない is
    // certain enough to answer past missing information.
    const d = drinkAvailability(mocha, statuses({ cocoaPowder: 'low', milkPowder: 'none' }));
    expect(d.status).toBe('none');
  });

  it('says 残り少なめ when every requirement is known and one is low', () => {
    const d = drinkAvailability(mocha, statuses({ cocoaPowder: 'low' }));
    expect(d.status).toBe('low');
    expect(d.reason).toContain('ココア');
  });
});
