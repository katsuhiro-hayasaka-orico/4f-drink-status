import type { StatusKey, StatusOrNone } from '../../shared/domain.js';

/**
 * Status colours, as references to the CSS variables in styles.css rather than
 * literals — that is what lets them change with the colour scheme. The values
 * themselves live in one place (`:root` and its dark-mode override).
 *
 * These are CSS values, so they work anywhere a stylesheet property is
 * expected: `style={{ color: … }}`, borders, backgrounds. They do NOT work in
 * an SVG presentation attribute (`fill="…"`), which is parsed before the
 * cascade and cannot resolve `var()`. Inside SVG, set the colour through
 * `style` instead.
 */
export const PALETTE: Record<StatusKey | 'none', string> = {
  available: 'var(--available)',
  low: 'var(--low)',
  unavailable: 'var(--unavailable)',
  none: 'var(--none)',
};

/** Text that sits on top of a filled status colour. */
export const ON_STATUS = 'var(--on-status)';

/** The neutral hairline colour, for meters with no data behind them. */
export const NEUTRAL_LINE = 'var(--line)';

export function statusColor(status: StatusOrNone): string {
  return PALETTE[status];
}
