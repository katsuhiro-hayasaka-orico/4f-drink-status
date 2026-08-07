import {
  SUBJECT_LABELS,
  type MaterialKey,
  type StatusKey,
  type SupplySubjectKey,
} from './domain.js';

/** What the machine can pour, and what each pour consumes. */
export interface Recipe {
  name: string;
  requires: readonly MaterialKey[];
  /** Iced drinks additionally depend on the ice maker. */
  iced: boolean;
}

export const RECIPES: readonly Recipe[] = [
  { name: 'コーヒー', requires: ['coffeeBeans'], iced: false },
  { name: 'ココア', requires: ['cocoaPowder'], iced: false },
  { name: 'カフェオレ', requires: ['coffeeBeans', 'milkPowder'], iced: false },
  { name: 'アイスコーヒー', requires: ['coffeeBeans', 'ice'], iced: true },
  { name: 'アイスココア', requires: ['cocoaPowder', 'ice'], iced: true },
  { name: 'アイスカフェオレ', requires: ['coffeeBeans', 'milkPowder', 'ice'], iced: true },
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
