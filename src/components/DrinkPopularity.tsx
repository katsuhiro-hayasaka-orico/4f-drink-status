import { DRINK_KEYS, DRINK_LABELS, type DrinkTally } from '../../shared/domain.js';
import { RECIPE_BY_KEY } from '../../shared/drinks.js';

export interface DrinkPopularityProps {
  totals: DrinkTally;
}

/**
 * ドリンクの人気度 — an all-time ranking of how often each drink gets
 * reported, split into 作れた / 作れなかった segments.
 *
 * The two segments are status colours (green/red), a pair the palette
 * validator measures at ΔE ≈ 4.8 under deuteranopia — indistinguishable by
 * colour alone. Identity therefore never rides on colour: the failed
 * segment carries a diagonal texture, the stacking order is fixed (made
 * first), a 2px surface gap separates the segments, and the legend pairs
 * each swatch with its ✓/× symbol. Counts are written out per row.
 */
export function DrinkPopularity({ totals }: DrinkPopularityProps) {
  const rows = DRINK_KEYS.map((key) => {
    const t = totals[key];
    return {
      key,
      name: DRINK_LABELS[key],
      iced: RECIPE_BY_KEY[key].iced,
      made: t.made,
      failed: t.failed,
      total: t.made + t.failed,
    };
  })
    // Stable sort: ties keep menu order (coffee → latte → mocha → cocoa).
    .sort((a, b) => b.total - a.total);

  const max = Math.max(...rows.map((r) => r.total));

  if (max === 0) {
    return (
      <p className="popularity__empty">
        まだドリンクの報告がありません。最初の「作れた」を投稿すると、ここにランキングが育ちます。
      </p>
    );
  }

  return (
    <div className="popularity">
      <div className="popularity__legend" aria-hidden="true">
        <span className="popularity__legend-item">
          <span className="popularity__swatch popularity__swatch--made" />✓ 作れた
        </span>
        <span className="popularity__legend-item">
          <span className="popularity__swatch popularity__swatch--failed" />× 作れなかった
        </span>
      </div>

      <ol className="popularity__list">
        {rows.map((r, i) => (
          <li
            className={`popularity__row${r.total === 0 ? ' popularity__row--none' : ''}`}
            key={r.key}
            aria-label={`${i + 1}位 ${r.name}：報告${r.total}回（作れた${r.made}回・作れなかった${r.failed}回）`}
          >
            <span className="popularity__rank" aria-hidden="true">
              {i + 1}
            </span>
            <span className="popularity__name" aria-hidden="true">
              <span
                className={`drink-group__badge drink-group__badge--${r.iced ? 'iced' : 'hot'} popularity__badge`}
              >
                {r.iced ? 'ICE' : 'HOT'}
              </span>
              {r.name}
              {i === 0 && r.total > 0 && <span className="popularity__top">人気No.1</span>}
            </span>
            <span
              className="popularity__bar"
              aria-hidden="true"
              title={`作れた ${r.made}回・作れなかった ${r.failed}回`}
            >
              {r.made > 0 && (
                <span
                  className="popularity__seg popularity__seg--made"
                  style={{ width: `${(r.made / max) * 100}%` }}
                />
              )}
              {r.failed > 0 && (
                <span
                  className="popularity__seg popularity__seg--failed"
                  style={{ width: `${(r.failed / max) * 100}%` }}
                />
              )}
            </span>
            <span className="popularity__count" aria-hidden="true">
              {r.total === 0 ? 'まだ報告なし' : `${r.total}回`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
