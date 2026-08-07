import { SUBJECT_LABELS, type MaterialKey, type StatusKey, type SubjectKey } from './domain.js';

/** What the machine can pour, and what each pour consumes. */
export interface Recipe {
  name: string;
  requires: readonly MaterialKey[];
}

export const RECIPES: readonly Recipe[] = [
  { name: 'コーヒー', requires: ['coffeeBeans'] },
  { name: 'ココア', requires: ['cocoaPowder'] },
  { name: 'カフェオレ', requires: ['coffeeBeans', 'milkPowder'] },
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
  statuses: Record<SubjectKey, StatusKey>,
): DrinkAvailability {
  const machineDown = statuses.machine === 'unavailable';
  let status: StatusKey = 'available';
  let reason = '材料が十分にあります';

  if (machineDown || recipe.requires.some((k) => statuses[k] === 'unavailable')) {
    status = 'unavailable';
    reason = machineDown ? 'マシンを利用できません' : '必要な材料が不足しています';
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
