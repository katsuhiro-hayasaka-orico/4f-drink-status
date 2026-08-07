import {
  MATERIAL_KEYS,
  SUBJECT_LABELS,
  type MaterialKey,
  type StatusKey,
  type SubjectKey,
} from '../../shared/domain.js';
import { statusColor } from '../lib/palette.js';

const DESCRIPTION: Record<StatusKey, string> = {
  available: '十分にあります',
  low: '残り少なめです',
  unavailable: '補充が必要です',
};

export interface IngredientLevelsProps {
  statuses: Record<SubjectKey, StatusKey>;
  levels: Record<MaterialKey, number>;
}

export function IngredientLevels({ statuses, levels }: IngredientLevelsProps) {
  return (
    <div className="grid-240">
      {MATERIAL_KEYS.map((key) => {
        const status = statuses[key];
        const color = statusColor(status);
        const pct = levels[key];
        const label = SUBJECT_LABELS[key];
        return (
          <div className="card" key={key}>
            <div className="ingredient__head">
              <span className="ingredient__name">{label}</span>
              <span className="ingredient__pct" style={{ color }}>
                約{pct}%
              </span>
            </div>
            <div
              className="meter"
              role="img"
              aria-label={`${label}の推定残量 約${pct}%`}
            >
              <div className="meter__fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <div className="ingredient__desc">{DESCRIPTION[status]}</div>
          </div>
        );
      })}
    </div>
  );
}
