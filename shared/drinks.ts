import {
  DRINK_LABELS,
  SUBJECT_LABELS,
  type DrinkKey,
  type MaterialKey,
  type StatusOrNone,
  type SupplySubjectKey,
} from './domain.js';

/** Which liquid ends up in the cup — drives the colour in the illustration. */
export type DrinkBase = 'coffee' | 'latte' | 'mocha' | 'cocoa';

/** What the machine can pour, and what each pour consumes. */
export interface Recipe {
  key: DrinkKey;
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
/* Names come from DRINK_LABELS in domain.ts — the one place they live. */
export const RECIPES: readonly Recipe[] = [
  {
    key: 'hotCoffee',
    name: DRINK_LABELS.hotCoffee,
    requires: ['coffeeBeans'],
    iced: false,
    base: 'coffee',
  },
  {
    key: 'caffeLatte',
    name: DRINK_LABELS.caffeLatte,
    requires: ['coffeeBeans', 'milkPowder'],
    iced: false,
    base: 'latte',
  },
  {
    key: 'caffeMocha',
    name: DRINK_LABELS.caffeMocha,
    requires: ['coffeeBeans', 'cocoaPowder', 'milkPowder'],
    iced: false,
    base: 'mocha',
  },
  {
    key: 'hotCocoa',
    name: DRINK_LABELS.hotCocoa,
    requires: ['cocoaPowder'],
    iced: false,
    base: 'cocoa',
  },

  {
    key: 'iceCoffee',
    name: DRINK_LABELS.iceCoffee,
    requires: ['coffeeBeans', 'ice'],
    iced: true,
    base: 'coffee',
  },
  {
    key: 'iceCaffeLatte',
    name: DRINK_LABELS.iceCaffeLatte,
    requires: ['coffeeBeans', 'milkPowder', 'ice'],
    iced: true,
    base: 'latte',
  },
  {
    key: 'iceCaffeMocha',
    name: DRINK_LABELS.iceCaffeMocha,
    requires: ['coffeeBeans', 'cocoaPowder', 'milkPowder', 'ice'],
    iced: true,
    base: 'mocha',
  },
  {
    key: 'iceCocoa',
    name: DRINK_LABELS.iceCocoa,
    requires: ['cocoaPowder', 'ice'],
    iced: true,
    base: 'cocoa',
  },
];

export const RECIPE_BY_KEY: Record<DrinkKey, Recipe> = Object.fromEntries(
  RECIPES.map((r) => [r.key, r]),
) as Record<DrinkKey, Recipe>;

export interface DrinkAvailability {
  name: string;
  /** `none` = required materials unreported: no claim either way. */
  status: StatusOrNone;
  stateText: string;
  mark: string;
  reason: string;
  /** 「コーヒー豆、ミルク」 */
  requiredLabel: string;
}

const STATE_TEXT: Record<StatusOrNone, string> = {
  available: '作れます',
  low: '残り少なめ',
  unavailable: '作れません',
  none: '情報がありません',
};

const STATE_MARK: Record<StatusOrNone, string> = {
  available: '✓',
  low: '!',
  unavailable: '×',
  none: '?',
};

/**
 * A drink is only as good as its scarcest ingredient — and the machine itself.
 *
 * A fresh direct report about THIS drink beats any derivation: someone who
 * watched it pour (or fail to) inside the window knows more than our
 * inference from ingredients. This is also the only channel through which a
 * failure with an unknown cause reaches the board — it expanded into no
 * material votes, so the card is where it speaks.
 *
 * Otherwise, certainty ranks above ignorance: a confirmed missing ingredient
 * says 作れません even if another ingredient is unreported, because that
 * answer is already decided. Only when nothing rules the drink out but some
 * requirement is unreported does it become 情報がありません — the honest
 * refusal to vouch for materials nobody has checked.
 */
export function drinkAvailability(
  recipe: Recipe,
  statuses: Record<SupplySubjectKey, StatusOrNone>,
  direct: 'made' | 'failed' | null = null,
): DrinkAvailability {
  if (direct !== null) {
    const status = direct === 'made' ? 'available' : 'unavailable';
    return {
      name: recipe.name,
      status,
      stateText: STATE_TEXT[status],
      mark: STATE_MARK[status],
      reason:
        direct === 'made'
          ? '実際に作れたという報告があります'
          : '作れなかったという報告があります',
      requiredLabel: recipe.requires.map((k) => SUBJECT_LABELS[k]).join('、'),
    };
  }

  const machineDown = statuses.machine === 'unavailable';
  const missing = recipe.requires.filter((k) => statuses[k] === 'unavailable');
  let status: StatusOrNone = 'available';
  let reason = '材料が十分にあります';

  if (machineDown || missing.length > 0) {
    status = 'unavailable';
    // Naming the missing ingredient saves a trip: you can tell at a glance
    // whether another drink on this list is still an option.
    reason = machineDown
      ? 'マシンを利用できません'
      : `${missing.map((k) => SUBJECT_LABELS[k]).join('・')}がありません`;
  } else if (recipe.requires.some((k) => statuses[k] === 'none')) {
    status = 'none';
    reason = '必要な材料の投稿が過去30分にありません';
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
