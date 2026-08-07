import type { Overall } from '../../shared/aggregate.js';
import type { LoungeHours } from '../../shared/hours.js';
import { statusColor } from '../lib/palette.js';

export interface Metric {
  label: string;
  value: string;
  color?: string;
}

export interface SummaryPanelProps {
  overall: Overall;
  metrics: readonly Metric[];
  hours: LoungeHours;
}

/**
 * The headline verdict, plus the four numbers it rests on.
 *
 * While the lounge is shut the headline answers the question people actually
 * have then — when it opens again — and the machine's state drops to a
 * subheading. Saying 「利用できます」 at 2am is true about the beans and wrong
 * about everything else.
 */
export function SummaryPanel({ overall, metrics, hours }: SummaryPanelProps) {
  const closed = hours.state === 'closed';

  return (
    <div className="summary">
      <div>
        <div className="summary__eyebrow">{closed ? '4Fラウンジ' : 'いまのマシン'}</div>
        {closed ? (
          <>
            <h1 className="summary__headline summary__headline--closed">いまは閉まっています</h1>
            <p className="summary__reason">{hours.note}</p>
            <p className="summary__aside">
              開放時間 {hours.rangeLabel}　—　最後に確認された状態：{overall.label}
            </p>
          </>
        ) : (
          <>
            <h1 className="summary__headline">
              <span style={{ color: statusColor(overall.tone) }}>{overall.label}</span>
            </h1>
            <p className="summary__reason">{overall.reason}</p>
            {hours.state === 'closingSoon' && <p className="summary__aside">{hours.note}</p>}
          </>
        )}
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
