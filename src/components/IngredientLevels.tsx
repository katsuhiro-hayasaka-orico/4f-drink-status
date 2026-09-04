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
  unavailable: '切れています',
};

export interface IngredientLevelsProps {
  statuses: Record<SupplySubjectKey, StatusOrNone>;
  levels: Record<MaterialKey, number | null>;
  /** Jump to the report form with this material already chosen. */
  onReport: (material: MaterialKey) => void;
}

/**
 * The four hoppers as numbers.
 *
 * Each card carries its own way in. Looking at 「ココア 約30%」 and thinking
 * 「いや、さっき見たらまだ結構あった」 is the moment someone most wants to
 * correct the board, and until now this card was read-only — the nearest way
 * to act on that thought was to scroll back up and claim a drink they had not
 * made. The button hands the material straight to the sighting picker.
 */
export function IngredientLevels({ statuses, levels, onReport }: IngredientLevelsProps) {
  const reportButton = (key: MaterialKey, label: string) => (
    <button
      type="button"
      className="ingredient__report"
      onClick={() => onReport(key)}
      aria-label={`${label}の見かけた残量を報告`}
    >
      見かけた残量を報告
    </button>
  );

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
              <div className="ingredient__desc">まだわかりません</div>
              {reportButton(key, label)}
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
            {reportButton(key, label)}
          </div>
        );
      })}
    </div>
  );
}
