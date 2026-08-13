/**
 * The heart of the drink-first reporting model: one 「カフェモカを作れた」
 * becomes votes about materials, because a poured mocha *is* evidence that
 * beans, cocoa, milk and the machine were all fine. The existing aggregation
 * (30-minute window, one vote per person, decay, afterglow) then derives the
 * stock levels without knowing drinks exist.
 *
 * The asymmetry is deliberate. Success vouches for every ingredient it used;
 * failure only accuses the one the reporter names. A failed ice latte says
 * nothing about the beans — voting them down would poison the board with
 * guesses, so an unknown cause expands to no material votes at all and the
 * failure speaks only through the drink's own card.
 */

import {
  isDrinkKey,
  isDrinkResult,
  isSupplySubjectKey,
  type ActionKey,
  type DrinkKey,
  type DrinkResult,
  type MaterialKey,
  type ReportRowValue,
  type ReportSubject,
} from './domain.js';
import { RECIPE_BY_KEY } from './drinks.js';

/** What the machine gave the reporter when it failed. */
export type FailureCause = MaterialKey | 'machine' | 'unknown';

export interface DrinkReportInput {
  drink: DrinkKey;
  result: DrinkResult;
  /** made only, optional: materials the reporter thought were running low. */
  low: readonly MaterialKey[];
  /** failed only, required: the named culprit, or honesty about not knowing. */
  cause: FailureCause | null;
}

/**
 * The one gate a drink report passes to become rows — API and client both.
 * Returns null for anything malformed: unknown drink, low-materials outside
 * the recipe, a cause naming an ingredient the drink doesn't use, a made
 * report carrying a cause, or a failed report carrying none.
 */
export function parseDrinkReport(v: unknown): DrinkReportInput | null {
  if (typeof v !== 'object' || v === null) return null;
  const { drink, result, low, cause } = v as {
    drink?: unknown;
    result?: unknown;
    low?: unknown;
    cause?: unknown;
  };
  if (!isDrinkKey(drink) || !isDrinkResult(result)) return null;
  const requires = RECIPE_BY_KEY[drink].requires as readonly string[];

  if (result === 'made') {
    if (cause !== undefined && cause !== null) return null;
    let lows: MaterialKey[] = [];
    if (low !== undefined) {
      if (!Array.isArray(low)) return null;
      if (!low.every((m) => typeof m === 'string' && requires.includes(m))) return null;
      lows = [...new Set(low)] as MaterialKey[];
    }
    return { drink, result, low: lows, cause: null };
  }

  // failed: the cause is mandatory — 'unknown' is an answer, absence is not.
  if (low !== undefined && (!Array.isArray(low) || low.length > 0)) return null;
  const okCause =
    cause === 'machine' ||
    cause === 'unknown' ||
    (typeof cause === 'string' && requires.includes(cause));
  if (!okCause) return null;
  return { drink, result, low: [], cause: cause as FailureCause };
}

export interface ReportRowSeed {
  subject: ReportSubject;
  action: ReportRowValue;
}

/** Expands a validated drink report into the rows to store, drink row first. */
export function buildDrinkReportRows(input: DrinkReportInput): ReportRowSeed[] {
  const rows: ReportRowSeed[] = [{ subject: input.drink, action: input.result }];
  const requires = RECIPE_BY_KEY[input.drink].requires;

  if (input.result === 'made') {
    // A poured drink is evidence about everything it consumed — including
    // the machine, which just demonstrably worked.
    for (const material of requires) {
      rows.push({
        subject: material,
        action: input.low.includes(material) ? 'low' : 'available',
      });
    }
    rows.push({ subject: 'machine', action: 'available' });
    return rows;
  }

  if (input.cause === 'machine') {
    rows.push({ subject: 'machine', action: 'unavailable' });
  } else if (input.cause !== 'unknown' && input.cause !== null) {
    rows.push({ subject: input.cause, action: 'unavailable' });
  }
  return rows;
}

/** Level implied for a material row, for toast copy. Reuses ACTION_META semantics. */
export function isMaterialRow(row: ReportRowSeed): row is { subject: MaterialKey; action: ActionKey } {
  return isSupplySubjectKey(row.subject) && row.subject !== 'machine';
}
