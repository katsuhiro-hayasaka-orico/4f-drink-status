import type { QueueSummary } from '../../shared/aggregate.js';
import { CONFIG } from '../../shared/config.js';
import { QUEUE_LEVELS, QUEUE_META, type QueueLevel } from '../../shared/domain.js';
import { relativeTime } from '../../shared/time.js';
import { CONFIDENCE_LABEL, confidenceStyle } from '../lib/confidence.js';
import { NEUTRAL_LINE, PALETTE, statusColor } from '../lib/palette.js';

/** One waiting person. Drawn rather than lettered so the row reads at a glance. */
function Figure({ color, faded }: { color: string; faded?: boolean }) {
  return (
    <svg viewBox="0 0 22 34" width={22} height={34} aria-hidden="true" style={{ opacity: faded ? 0.35 : 1 }}>
      <circle cx={11} cy={7} r={6} style={{ fill: color }} />
      <path d="M11 15c6 0 9 4 9 10v9H2v-9c0-6 3-10 9-10z" style={{ fill: color }} />
    </svg>
  );
}

export interface QueuePanelProps {
  summary: QueueSummary;
  now: number;
  posting: boolean;
  /** Queue reporting lives here, next to what it describes — not in the drink form. */
  onPostQueue: (level: QueueLevel) => void;
}

export function QueuePanel({ summary, now, posting, onPostQueue }: QueuePanelProps) {
  const meta = summary.level ? QUEUE_META[summary.level] : null;
  const color = meta ? statusColor(meta.tone) : PALETTE.none;
  const agreementText = summary.total ? `${summary.agreement}%` : '—';

  // 6人以上は6体＋「＋」で打ち切ります。正確な人数は誰も報告していないので、
  // それらしい数を並べるより「これ以上」と示すほうが正直です。
  const figures = meta ? meta.people : 0;

  return (
    <div className="queue">
      <div className="queue__main">
        <div className="queue__figures" aria-hidden="true">
          {figures === 0 ? (
            <span className="queue__empty-mark">—</span>
          ) : (
            <>
              {Array.from({ length: figures }, (_, i) => (
                <Figure key={i} color={color} />
              ))}
              {summary.level === 'long' && <span className="queue__plus">＋</span>}
            </>
          )}
        </div>
        <div className="queue__text">
          <div className="queue__head">
            <span className="queue__eyebrow">いまの混雑</span>
            <span className="pill" style={confidenceStyle(summary.confidence)}>
              {CONFIDENCE_LABEL[summary.confidence]}
            </span>
          </div>
          <div className="queue__headline" style={{ color }}>
            {meta ? meta.headline : '情報がありません'}
          </div>
          <div className="queue__wait">
            {meta ? `${meta.quote}待ち　${meta.wait}` : `過去${CONFIG.queueWindowMin}分に投稿がありません`}
          </div>
        </div>
      </div>

      <div className="queue__meta">
        <div className="observation__agreement">
          <span>みんなの一致度</span>
          <strong>{agreementText}</strong>
        </div>
        {/* Decorative — the visible line above already carries the number. */}
        <div className="observation__meter" aria-hidden="true">
          <div
            style={{
              width: `${summary.agreement}%`,
              background: summary.level ? color : NEUTRAL_LINE,
            }}
          />
        </div>
        <div className="observation__foot">
          <span>
            {summary.lastAt ? `最終観測 ${relativeTime(summary.lastAt, now)}` : '最終観測なし'}
          </span>
          <span>{summary.total}票</span>
        </div>
      </div>

      <div className="queue__report">
        <span className="queue__report-label">いま何人並んでいますか？</span>
        <div className="queue__report-buttons">
          {QUEUE_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className="chip chip--small"
              disabled={posting}
              onClick={() => onPostQueue(level)}
            >
              {QUEUE_META[level].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
