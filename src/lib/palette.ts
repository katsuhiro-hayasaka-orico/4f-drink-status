import type { StatusKey, StatusOrNone } from '../../shared/domain.js';

/** Status colours, matching the CSS custom properties in styles.css. */
export const PALETTE: Record<StatusKey | 'none', string> = {
  available: '#5e7a4a',
  low: '#b4552d',
  unavailable: '#a63c28',
  none: '#8a6a50',
};

export function statusColor(status: StatusOrNone): string {
  return PALETTE[status];
}
