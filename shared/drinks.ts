import {
  SUBJECT_LABELS,
  type MaterialKey,
  type StatusKey,
  type SupplySubjectKey,
} from './domain.js';

/** Which liquid ends up in the cup — drives the colour in the illustration. */
export type DrinkBase = 'coffee' | 'latte' | 'mocha' | 'cocoa';

/** What the machine can pour, and what each pour consumes. */
export interface Recipe {
  name: string;
  requires: readonly MaterialKey[];
  /** Iced drinks additionally depend on the ice maker. */
  iced: boolean;
  base: DrinkBase;
}

/**
 * The machine's actual menu, minus 熱湯 and アメリカン — neither is worth a card
 * here, and 熱湯 needs nothing the board tracks.
 *
 * Names match the buttons on the machine. 「カフェオレ」 was wrong: the machine
 * pours a latte, and the two are different drinks.
 *
 * Ordered coffee → latte → mocha → cocoa, so the hot row and the iced row below
 * it line up drink-for-drink.
 */
export const RECIPES: readonly Recipe[] = [
  { name: 'ホットコーヒー', requires: ['coffeeBeans'], iced: false, base: 'coffee' },
  { name: 'カフェラテ', requires: ['coffeeBeans', 'milkPowder'], iced: false, base: 'latte' },
  {
    name: 'カフェモカ',
    requires: ['coffeeBeans', 'cocoaPowder', 'milkPowder'],
    iced: false,
    base: 'mocha',
  },
  { name: 'ホットココア', requires: ['cocoaPowder'], iced: false, base: 'cocoa' },

  { name: 'アイスコーヒー', requires: ['coffeeBeans', 'ice'], iced: true, base: 'coffee' },
  {
    name: 'アイスカフェラテ',
    requires: ['coffeeBeans', 'milkPowder', 'ice'],
    iced: true,
    base: 'latte',
  },
  {
    name: 'アイスカフェモカ',
    requires: ['coffeeBeans', 'cocoaPowder', 'milkPowder', 'ice'],
    iced: true,
    base: 'mocha',
  },
  { name: 'アイスココア', requires: ['cocoaPowder', 'ice'], iced: true, base: 'cocoa' },
];

export interface DrinkAvailability {
  name: string;
  status: StatusKey;
  stateText: string;
  mark: string;
  reason: string;
  /** 「コーヒー豆、ミルク」 */
  requiredLabel: string;
}

const STATE_TEXT: Record<StatusKey, string> = {
  available: '作れます',
  low: '残り少なめ',
  unavailable: '作れません',
};

const STATE_MARK: Record<StatusKey, string> = {
  available: '✓',
  low: '!',
  unavailable: '×',
};

/** A drink is only as good as its scarcest ingredient — and the machine itself. */
export function drinkAvailability(
  recipe: Recipe,
  statuses: Record<SupplySubjectKey, StatusKey>,
): DrinkAvailability {
  const machineDown = statuses.machine === 'unavailable';
  const missing = recipe.requires.filter((k) => statuses[k] === 'unavailable');
  let status: StatusKey = 'available';
  let reason = '材料が十分にあります';

  if (machineDown || missing.length > 0) {
    status = 'unavailable';
    // Naming the missing ingredient saves a trip: you can tell at a glance
    // whether another drink on this list is still an option.
    reason = machineDown
      ? 'マシンを利用できません'
      : `${missing.map((k) => SUBJECT_LABELS[k]).join('・')}がありません`;
  } else if (recipe.requires.some((k) => statuses[k] === 'low')) {
    status = 'low';
    reason = `${recipe.requires
      .filter((k) => statuses[k] === 'low')
      .map((k) => SUBJECT_LABELS[k])
      .join('・')}の残量が少なめです`;
  }

  return {
    name: recipe.name,
    status,
    stateText: STATE_TEXT[status],
    mark: STATE_MARK[status],
    reason,
    requiredLabel: recipe.requires.map((k) => SUBJECT_LABELS[k]).join('、'),
  };
}
