import { useId, useState } from 'react';
import { RECIPES, drinkAvailability, type Recipe } from '../../shared/drinks.js';
import type { StatusOrNone, SupplySubjectKey } from '../../shared/domain.js';
import { statusColor } from '../lib/palette.js';
import { DrinkFigure } from './DrinkFigure.js';

/**
 * Hot and iced are shown as separate groups.
 *
 * Left to one grid, the six cards wrap mid-list at most widths — the last hot
 * drink and the first iced one end up side by side, and you have to read every
 * name to find the row you want. Grouping also gives the iced set somewhere to
 * say that it depends on ice, instead of repeating a badge on each card.
 */
interface Group {
  key: string;
  badge: string;
  label: string;
  note?: string;
  recipes: Recipe[];
}

const GROUPS: Group[] = [
  {
    key: 'hot',
    badge: 'HOT',
    label: 'ホット',
    recipes: RECIPES.filter((r) => !r.iced),
  },
  {
    key: 'iced',
    badge: 'ICE',
    label: 'アイス',
    note: '氷の残量にも左右されます',
    recipes: RECIPES.filter((r) => r.iced),
  },
];

export interface DrinkAvailabilityProps {
  statuses: Record<SupplySubjectKey, StatusOrNone>;
}

/** 「作れません 2種・作れます 5種…」 — trouble first, then good news. */
function summaryLine(statuses: Record<SupplySubjectKey, StatusOrNone>): string {
  const counts = { unavailable: 0, low: 0, available: 0, none: 0 };
  for (const recipe of RECIPES) counts[drinkAvailability(recipe, statuses).status] += 1;
  const parts: string[] = [];
  if (counts.unavailable) parts.push(`作れません ${counts.unavailable}種`);
  if (counts.low) parts.push(`残り少なめ ${counts.low}種`);
  if (counts.available) parts.push(`作れます ${counts.available}種`);
  if (counts.none) parts.push(`情報なし ${counts.none}種`);
  return parts.join('・');
}

/**
 * Eight cards was the page's longest block, and it sat between a first-time
 * visitor and the report form (audit P1: pre-form information overload).
 * The always-visible one-line tally answers the common question; the cards
 * are a click away for anyone who wants the per-drink detail.
 */
export function DrinkAvailability({ statuses }: DrinkAvailabilityProps) {
  const [open, setOpen] = useState(false);
  const detailId = useId().replace(/:/g, '');

  return (
    <>
      <div className="drink-summary">
        <span className="drink-summary__text">いま{summaryLine(statuses)}</span>
        <button
          type="button"
          className="drink-toggle"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '詳細を閉じる' : 'ドリンク別の詳細を見る'}
        </button>
      </div>

      <div id={detailId} hidden={!open}>
        {GROUPS.map((group) => (
        <div className="drink-group" key={group.key}>
          <h3 className="drink-group__head">
            <span className={`drink-group__badge drink-group__badge--${group.key}`}>
              {group.badge}
            </span>
            <span className="drink-group__label">{group.label}</span>
            {group.note && <span className="drink-group__note">{group.note}</span>}
          </h3>
          <div className="grid-240">
            {group.recipes.map((recipe) => {
              const d = drinkAvailability(recipe, statuses);
              const color = statusColor(d.status);
              return (
                <div className="card drink" key={d.name}>
                  <div className="drink__top">
                    <div className="drink__info">
                      <div className="drink__head">
                        <span
                          className="drink__mark"
                          style={{ background: color }}
                          aria-hidden="true"
                        >
                          {d.mark}
                        </span>
                        <span className="drink__name">{d.name}</span>
                      </div>
                      <div className="drink__state" style={{ color }}>
                        {d.stateText}
                      </div>
                      <p className="drink__reason">{d.reason}</p>
                    </div>
                    <DrinkFigure base={recipe.base} iced={recipe.iced} status={d.status} />
                  </div>
                  <div className="drink__required">
                    <strong>必要な材料</strong>　{d.requiredLabel}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        ))}
      </div>
    </>
  );
}
