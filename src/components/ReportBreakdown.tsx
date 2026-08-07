import type { CSSProperties } from 'react';
import { toStatus } from '../../shared/aggregate.js';
import { CONFIG } from '../../shared/config.js';
import {
  QUEUE_META,
  QUEUE_SUBJECT,
  SUBJECT_KEYS,
  SUBJECT_LABELS,
  reportValueQuote,
  type ActionKey,
  type QueueLevel,
  type Report,
  type ReportValue,
  type SubjectKey,
} from '../../shared/domain.js';
import { relativeTime } from '../../shared/time.js';
import { ON_STATUS, PALETTE, statusColor } from '../lib/palette.js';

export type FilterKey = SubjectKey | 'all';

const FILTERS: readonly { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'すべて' },
  ...SUBJECT_KEYS.map((k) => ({ key: k as FilterKey, label: SUBJECT_LABELS[k] })),
];

/** 作れない is filled rather than outlined — it's the one worth spotting. */
function tagStyle(subject: SubjectKey, value: ReportValue): CSSProperties {
  if (subject === QUEUE_SUBJECT) {
    const tone = QUEUE_META[value as QueueLevel].tone;
    return tone === 'unavailable'
      ? { background: PALETTE.unavailable, color: ON_STATUS }
      : { border: `2px solid ${statusColor(tone)}`, color: statusColor(tone) };
  }
  const action = value as ActionKey;
  if (action === 'refilled') return { border: '2px solid var(--muted)', color: 'var(--muted)' };
  const status = toStatus(action);
  if (status === 'unavailable') return { background: PALETTE.unavailable, color: ON_STATUS };
  return { border: `2px solid ${PALETTE[status]}`, color: PALETTE[status] };
}

export interface ReportBreakdownProps {
  reports: readonly Report[];
  me: string;
  now: number;
  filter: FilterKey;
  onFilter: (filter: FilterKey) => void;
}

export function ReportBreakdown({ reports, me, now, filter, onFilter }: ReportBreakdownProps) {
  const rows = reports
    .filter((r) => filter === 'all' || r.subject === filter)
    .slice(0, CONFIG.reportTableLimit);

  return (
    <div className="reports">
      <div className="reports__filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="filter"
            aria-pressed={filter === f.key}
            onClick={() => onFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="reports__scroll">
        <div className="reports__table">
          <div className="reports__row reports__row--head">
            <span>対象</span>
            <span>状態</span>
            <span>時刻</span>
            <span>投稿者</span>
          </div>
          {rows.map((r) => (
            <div className="reports__row" key={r.id}>
              <span className="reports__subject">{SUBJECT_LABELS[r.subject]}</span>
              <span>
                <span className="tag" style={tagStyle(r.subject, r.action)}>
                  {reportValueQuote(r.subject, r.action)}
                </span>
              </span>
              <span className="reports__muted">{relativeTime(r.createdAt, now)}</span>
              <span className="reports__muted">
                {r.userId === me ? '利用者（あなた）' : r.userLabel}
              </span>
            </div>
          ))}
          {rows.length === 0 && <div className="reports__empty">該当する投稿はありません</div>}
        </div>
      </div>
    </div>
  );
}
