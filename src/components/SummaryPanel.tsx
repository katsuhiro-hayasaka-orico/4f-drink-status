import type { Overall } from '../../shared/aggregate.js';
import type { ConfidenceKey } from '../../shared/domain.js';
import type { LoungeHours } from '../../shared/hours.js';
import { CONFIDENCE_LABEL, confidenceStyle } from '../lib/confidence.js';
import { statusColor } from '../lib/palette.js';

export interface Metric {
  label: string;
  value: string;
  color?: string;
}

export interface SummaryPanelProps {
  overall: Overall;
  /** Shown beside the headline, so the verdict never outruns its evidence. */
  confidence: ConfidenceKey;
  metrics: readonly Metric[];
  hours: LoungeHours;
  onReport: () => void;
}

/**
 * The headline verdict, plus the four numbers it rests on — and the page's
 * primary CTA. The audit's core finding was that the board read as a
 * read-only dashboard; the invitation to post now lives in the hero, not
 * a screen and a half below it.
 *
 * While the lounge is shut the headline answers the question people actually
 * have then — when it opens again — and the machine's state drops to a
 * subheading. Saying 「利用できます」 at 2am is true about the beans and wrong
 * about everything else.
 */
export function SummaryPanel({ overall, confidence, metrics, hours, onReport }: SummaryPanelProps) {
  const closed = hours.state === 'closed';

  return (
    <div className="summary">
      <div>
        <div className="summary__eyebrow">{closed ? '4Fラウンジ' : 'いまのマシン'}</div>
        {closed ? (
          <>
            <h1 className="summary__headline summary__headline--closed">いまは閉まっています</h1>
            <p className="summary__reason">{hours.note}</p>
            <p className="summary__aside">開放時間 {hours.rangeLabel}</p>
          </>
        ) : (
          <>
            <h1 className="summary__headline">
              <span style={{ color: statusColor(overall.tone) }}>{overall.label}</span>
              {/* The green verdict and 確からしさ：低 used to sit a column
                  apart, reading as a contradiction. Same line now. */}
              <span className="pill summary__confidence" style={confidenceStyle(confidence)}>
                {CONFIDENCE_LABEL[confidence]}
              </span>
            </h1>
            <p className="summary__reason">{overall.reason}</p>
            {hours.state === 'closingSoon' && <p className="summary__aside">{hours.note}</p>}
          </>
        )}
        <button type="button" className="summary__cta" onClick={onReport}>
          ＋ 今の状態を投稿する
        </button>
      </div>
      <div className="metrics">
        {metrics.map((m) => (
          <div className="metrics__row" key={m.label}>
            <span className="metrics__label">{m.label}</span>
            <span className="metrics__value" style={m.color ? { color: m.color } : undefined}>
              {m.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
