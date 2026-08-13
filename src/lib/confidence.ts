import type { CSSProperties } from 'react';
import type { ConfidenceKey } from '../../shared/domain.js';
import { NEUTRAL_LINE, ON_STATUS, PALETTE } from './palette.js';

export const CONFIDENCE_LABEL: Record<ConfidenceKey, string> = {
  high: '確からしさ：高',
  medium: '確からしさ：中',
  low: '確からしさ：低',
  none: '情報なし',
};

/** 高 is filled; the weaker grades are outlined, so certainty reads at a glance. */
export function confidenceStyle(confidence: ConfidenceKey): CSSProperties {
  switch (confidence) {
    case 'high':
      return { background: PALETTE.available, color: ON_STATUS };
    case 'medium':
      return { border: `2px solid ${PALETTE.low}`, color: PALETTE.low };
    case 'low':
      return { border: `2px solid ${PALETTE.unavailable}`, color: PALETTE.unavailable };
    case 'none':
      return { border: `2px solid ${NEUTRAL_LINE}`, color: PALETTE.none };
  }
}
