import {
  MATERIAL_KEYS,
  SUBJECT_LABELS,
  type MaterialKey,
  type StatusKey,
  type StatusOrNone,
  type SupplySubjectKey,
} from '../../shared/domain.js';
import { statusColor } from '../lib/palette.js';

const DESCRIPTION: Record<StatusKey, string> = {
  available: '十分にあります',
  low: '残り少なめです',
  unavailable: '補充が必要です',
};

export interface IngredientLevelsProps {
  statuses: Record<SupplySubjectKey, StatusOrNone>;
  levels: Record<MaterialKey, number | null>;
}

export function IngredientLevels({ statuses, levels }: IngredientLevelsProps) {
  return (
    <div className="grid-240">
      {MATERIAL_KEYS.map((key) => {
        const status = statuses[key];
        const level = levels[key];
        const label = SUBJECT_LABELS[key];

        // Unreported inside the window (or the board is closed): say so,
        // rather than dressing a guess up as a percentage.
        if (status === 'none' || level === null) {
          return (
            <div className="card" key={key}>
              <div className="ingredient__head">
                <span className="ingredient__name">{label}</span>
                <span className="ingredient__pct" style={{ color: statusColor('none') }}>
                  —
                </span>
              </div>
              <div className="meter" aria-hidden="true">
                <div className="meter__fill" style={{ width: 0 }} />
              </div>
              <div className="ingredient__desc">情報がありません</div>
            </div>
          );
        }

        const color = statusColor(status);
        return (
          <div className="card" key={key}>
            <div className="ingredient__head">
              <span className="ingredient__name">{label}</span>
              <span className="ingredient__pct" style={{ color }}>
                約{level}%
              </span>
            </div>
            {/* Decorative: the visible 「約N%」 beside the name already says it. */}
            <div className="meter" aria-hidden="true">
              <div className="meter__fill" style={{ width: `${level}%`, background: color }} />
            </div>
            <div className="ingredient__desc">{DESCRIPTION[status]}</div>
          </div>
        );
      })}
    </div>
  );
}
