import type { Overall } from '../../shared/aggregate.js';
import { statusColor } from '../lib/palette.js';

export interface Metric {
  label: string;
  value: string;
  color?: string;
}

export interface SummaryPanelProps {
  overall: Overall;
  metrics: readonly Metric[];
}

/** The headline verdict, plus the four numbers it rests on. */
export function SummaryPanel({ overall, metrics }: SummaryPanelProps) {
  return (
    <div className="summary">
      <div>
        <div className="summary__eyebrow">いまのマシン</div>
        <h1 className="summary__headline">
          <span style={{ color: statusColor(overall.tone) }}>{overall.label}</span>
        </h1>
        <p className="summary__reason">{overall.reason}</p>
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
