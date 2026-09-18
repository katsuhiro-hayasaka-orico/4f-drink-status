import { tierByKey, tierDescription, type TierKey } from '../../shared/contributors.js';

export interface ContributorBadgeProps {
  /** null / undefined renders nothing — most posters have no 称号 yet. */
  tier: TierKey | null | undefined;
}

/**
 * The 称号 that sits beside a poster's name.
 *
 * Star count first, word second, colour last: the three tiers have to be
 * separable in both themes and under every kind of colour vision, so the
 * number of stars carries the ranking on its own and the pill's tint is
 * decoration. The stars are drawn rather than typed — ★ (U+2605) turns into a
 * colour emoji on some Android builds, which would drag the tint back into
 * carrying meaning.
 */
export function ContributorBadge({ tier }: ContributorBadgeProps) {
  if (!tier) return null;
  const meta = tierByKey(tier);

  return (
    <span className={`tier-badge tier-badge--${meta.key}`}>
      <span className="tier-badge__stars" aria-hidden="true">
        {Array.from({ length: meta.stars }, (_, i) => (
          <svg key={i} viewBox="0 0 24 24" width="9" height="9" focusable="false">
            <path
              fill="currentColor"
              d="M12 2.6l2.6 6.1 6.6.6-5 4.3 1.5 6.4L12 16.6 6.3 20l1.5-6.4-5-4.3 6.6-.6z"
            />
          </svg>
        ))}
      </span>
      <span aria-hidden="true">{meta.label}</span>
      <span className="visually-hidden">{tierDescription(meta)}</span>
    </span>
  );
}
