import { RECIPES, drinkAvailability } from '../../shared/drinks.js';
import type { StatusKey, SubjectKey } from '../../shared/domain.js';
import { statusColor } from '../lib/palette.js';

export interface DrinkAvailabilityProps {
  statuses: Record<SubjectKey, StatusKey>;
}

export function DrinkAvailability({ statuses }: DrinkAvailabilityProps) {
  return (
    <div className="grid-240">
      {RECIPES.map((recipe) => {
        const d = drinkAvailability(recipe, statuses);
        const color = statusColor(d.status);
        return (
          <div className="card" key={d.name}>
            <div className="drink__head">
              <span className="drink__mark" style={{ background: color }} aria-hidden="true">
                {d.mark}
              </span>
              <span className="drink__name">{d.name}</span>
            </div>
            <div className="drink__state" style={{ color }}>
              {d.stateText}
            </div>
            <p className="drink__reason">{d.reason}</p>
            <div className="drink__required">
              <strong>必要な材料</strong>　{d.requiredLabel}
            </div>
          </div>
        );
      })}
    </div>
  );
}
