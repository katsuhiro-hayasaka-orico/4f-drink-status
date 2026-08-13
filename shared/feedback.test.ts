import { describe, expect, it } from 'vitest';
import { CONFIG } from './config.js';
import { isMoodKey, normalizeFeedbackBody } from './domain.js';

const MAX = CONFIG.feedbackMaxLength;

describe('isMoodKey', () => {
  it('accepts exactly the three moods', () => {
    expect(isMoodKey('happy')).toBe(true);
    expect(isMoodKey('neutral')).toBe(true);
    expect(isMoodKey('sad')).toBe(true);

    expect(isMoodKey('angry')).toBe(false);
    expect(isMoodKey('')).toBe(false);
    expect(isMoodKey(undefined)).toBe(false);
    expect(isMoodKey(1)).toBe(false);
  });
});

describe('normalizeFeedbackBody', () => {
  it('trims and passes an ordinary comment through', () => {
    expect(normalizeFeedbackBody('  氷が切れがちです  ', MAX)).toBe('氷が切れがちです');
  });

  it('allows an empty body — that is a mood-only submission', () => {
    expect(normalizeFeedbackBody('', MAX)).toBe('');
    // Whitespace-only collapses to the same thing.
    expect(normalizeFeedbackBody('   \n ', MAX)).toBe('');
  });

  it('enforces the length ceiling after trimming', () => {
    expect(normalizeFeedbackBody('あ'.repeat(MAX), MAX)).toBe('あ'.repeat(MAX));
    expect(normalizeFeedbackBody('あ'.repeat(MAX + 1), MAX)).toBeNull();
    // Surrounding whitespace must not count against the limit.
    expect(normalizeFeedbackBody(`  ${'あ'.repeat(MAX)}  `, MAX)).toBe('あ'.repeat(MAX));
  });

  it('rejects anything that is not a string', () => {
    expect(normalizeFeedbackBody(undefined, MAX)).toBeNull();
    expect(normalizeFeedbackBody(null, MAX)).toBeNull();
    expect(normalizeFeedbackBody(42, MAX)).toBeNull();
    expect(normalizeFeedbackBody(['x'], MAX)).toBeNull();
  });
});
