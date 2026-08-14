import type { Summary } from '../../shared/aggregate.js';
import { CONFIG } from '../../shared/config.js';
import { SUBJECT_LABELS, type StatusOrNone } from '../../shared/domain.js';
import { relativeTime } from '../../shared/time.js';
import { CONFIDENCE_LABEL, confidenceStyle } from '../lib/confidence.js';
import { NEUTRAL_LINE, PALETTE, statusColor } from '../lib/palette.js';

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

export interface ObservationsProps {
  summaries: readonly Summary[];
  now: number;
}

export function Observations({ summaries, now }: ObservationsProps) {
  // Deliberately NOT a live region: five cards re-rendering on every poll
  // would read out the whole board. The App keeps a one-line hidden live
  // region with just the headline instead.
  return (
    <div className="grid-250">
      {summaries.map((s) => {
        const label = SUBJECT_LABELS[s.subject];
        const agreementText = s.total ? `${s.agreement}%` : '—';
        // 清掃中 is an outage with a promise attached: amber, its own words.
        const cleaning = s.dominantAction === 'cleaning';
        const statusText = cleaning ? '清掃中' : STATUS_TEXT[s.status];
        const quote = cleaning ? '清掃中' : STATUS_QUOTE[s.status];
        const color = cleaning ? PALETTE.low : statusColor(s.status);
        return (
          <div className="card" key={s.subject}>
            <div className="observation__head">
              <span className="observation__label">{label}</span>
              <span className="pill" style={confidenceStyle(s.confidence)}>
                {CONFIDENCE_LABEL[s.confidence]}
              </span>
            </div>
            <div className="observation__status" style={{ color }}>
              {statusText}
            </div>
            <p className="observation__copy">
              {s.total
                ? `${s.total}人中${s.supporters}人が「${quote}」と報告`
                : s.carried
                  ? `過去${CONFIG.observationWindowMin}分の投稿はなく、最後の「${STATUS_QUOTE.available}」報告を保持中`
                  : `過去${CONFIG.observationWindowMin}分に有効な投稿がありません`}
            </p>
            <div className="observation__agreement">
              <span>みんなの一致度</span>
              <strong>{agreementText}</strong>
            </div>
            {/* Decorative: the visible 「みんなの一致度」 line above already
                carries the same number, so a labelled meter reads it twice. */}
            <div className="observation__meter" aria-hidden="true">
              <div
                style={{
                  width: `${s.agreement}%`,
                  background: s.status === 'none' ? NEUTRAL_LINE : color,
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
