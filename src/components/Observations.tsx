import type { CSSProperties } from 'react';
import type { Summary } from '../../shared/aggregate.js';
import { CONFIG } from '../../shared/config.js';
import { SUBJECT_LABELS, type ConfidenceKey, type StatusOrNone } from '../../shared/domain.js';
import { relativeTime } from '../../shared/time.js';
import { PALETTE, statusColor } from '../lib/palette.js';

const STATUS_TEXT: Record<StatusOrNone, string> = {
  available: '利用できます',
  low: '残り少なめ',
  unavailable: '利用できません',
  none: '情報がありません',
};

/** How people phrased it, for the 「N人中M人が…」 line. */
const STATUS_QUOTE: Record<StatusOrNone, string> = {
  available: '取れた・利用できる',
  low: '残り少なめ',
  unavailable: '作れない',
  none: '情報なし',
};

const CONFIDENCE_LABEL: Record<ConfidenceKey, string> = {
  high: '確からしさ：高',
  medium: '確からしさ：中',
  low: '確からしさ：低',
  none: '情報なし',
};

/** 高 is filled; the weaker grades are outlined, so certainty reads at a glance. */
function confidenceStyle(confidence: ConfidenceKey): CSSProperties {
  switch (confidence) {
    case 'high':
      return { background: PALETTE.available, color: '#fffaf0' };
    case 'medium':
      return { border: `2px solid ${PALETTE.low}`, color: PALETTE.low };
    case 'low':
      return { border: `2px solid ${PALETTE.unavailable}`, color: PALETTE.unavailable };
    case 'none':
      return { border: '2px solid #d9c8ac', color: '#8a6a50' };
  }
}

export interface ObservationsProps {
  summaries: readonly Summary[];
  now: number;
}

export function Observations({ summaries, now }: ObservationsProps) {
  return (
    <div className="grid-250" aria-live="polite">
      {summaries.map((s) => {
        const label = SUBJECT_LABELS[s.subject];
        const agreementText = s.total ? `${s.agreement}%` : '—';
        return (
          <div className="card" key={s.subject}>
            <div className="observation__head">
              <span className="observation__label">{label}</span>
              <span className="pill" style={confidenceStyle(s.confidence)}>
                {CONFIDENCE_LABEL[s.confidence]}
              </span>
            </div>
            <div className="observation__status" style={{ color: statusColor(s.status) }}>
              {STATUS_TEXT[s.status]}
            </div>
            <p className="observation__copy">
              {s.total
                ? `${s.total}人中${s.supporters}人が「${STATUS_QUOTE[s.status]}」と報告`
                : `過去${CONFIG.observationWindowMin}分に有効な投稿がありません`}
            </p>
            <div className="observation__agreement">
              <span>みんなの一致度</span>
              <strong>{agreementText}</strong>
            </div>
            <div
              className="observation__meter"
              role="img"
              aria-label={`${label}の一致度 ${agreementText}`}
            >
              <div
                style={{
                  width: `${s.agreement}%`,
                  background: s.status === 'none' ? '#d9c8ac' : statusColor(s.status),
                }}
              />
            </div>
            <div className="observation__foot">
              <span>{s.lastAt ? `最終観測 ${relativeTime(s.lastAt, now)}` : '最終観測なし'}</span>
              <span>{s.total}票</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
