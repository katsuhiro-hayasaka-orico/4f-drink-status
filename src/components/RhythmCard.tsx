import { Fragment } from 'react';
import {
  RHYTHM_DAY_LABELS,
  RHYTHM_HOURS,
  type Rhythm,
  type RhythmCell,
} from '../../shared/rhythm.js';

/**
 * いつ切れやすい？ — four weeks of weekday×hour habit, as a diverging
 * heatmap (green=作れる … red=切れがち) plus an hourly crowding bar strip.
 *
 * Dataviz notes: the cell scale is a DIVERGING ramp (two hues over a neutral
 * waist, six steps as --rhythm-0..5, re-anchored in dark mode so trouble
 * glows bright on the dark ground). Green↔red is exactly the axis CVD
 * flattens, so color never works alone here: the two reddest steps carry a
 * hatch texture, the legend wears ✓/× glyphs, and every cell exposes its
 * counts through title + aria-label. Crowding is a single gold series — the
 * strip's heading names it, so no legend box.
 */

export interface RhythmCardProps {
  rhythm: Rhythm;
  fetchedAt: number;
}

function stamp(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function cellTitle(cell: RhythmCell): string {
  const day = RHYTHM_DAY_LABELS[cell.dow];
  if (cell.level === null) return `${day}曜${cell.hour}時台: 投稿なし`;
  const thin = cell.faint ? '（投稿が少なめ）' : '';
  return `${day}曜${cell.hour}時台: 作れる${cell.good}件・切れがち${cell.bad}件${thin}`;
}

function cellClass(cell: RhythmCell): string {
  if (cell.level === null) return 'rhythm__cell rhythm__cell--empty';
  const hatch = cell.level >= 4 ? ' rhythm__cell--hatch' : '';
  const faint = cell.faint ? ' rhythm__cell--faint' : '';
  return `rhythm__cell rhythm__cell--l${cell.level}${hatch}${faint}`;
}

export function RhythmCard({ rhythm, fetchedAt }: RhythmCardProps) {
  if (rhythm.insufficient) {
    return (
      <div className="card rhythm rhythm--empty">
        <p className="rhythm__empty-lead">まだ傾向を出せるだけの投稿がありません。</p>
        <p className="rhythm__note">
          投稿が集まると、曜日×時間帯の「作れる／切れがち」マップがここに表示されます
          （現在 {rhythm.totalCount} 件・直近4週間）。
        </p>
      </div>
    );
  }

  const maxLoad = Math.max(...rhythm.queueLoad.map((q) => q.avgPeople), 0);

  return (
    <div className="card rhythm">
      <div className="rhythm__head">
        <span className="rhythm__lead">緑＝作れる、赤＝切れがち</span>
        <span className="rhythm__stamp">更新 {stamp(fetchedAt)}</span>
      </div>

      {/* ---- weekday × hour heatmap -------------------------------------- */}
      <div
        className="rhythm__grid"
        role="img"
        aria-label="曜日と時間帯ごとの作れる・切れがちの傾向マップ"
      >
        <span className="rhythm__axis" aria-hidden="true" />
        {RHYTHM_HOURS.map((h) => (
          <span key={`h${h}`} className="rhythm__axis" aria-hidden="true">
            {h}
          </span>
        ))}
        {rhythm.heat.map((dayRow) => (
          <Fragment key={dayRow[0].dow}>
            <span className="rhythm__axis rhythm__axis--day" aria-hidden="true">
              {RHYTHM_DAY_LABELS[dayRow[0].dow]}
            </span>
            {dayRow.map((cell) => (
              <span
                key={`${cell.dow}:${cell.hour}`}
                className={cellClass(cell)}
                title={cellTitle(cell)}
                aria-label={cellTitle(cell)}
              />
            ))}
          </Fragment>
        ))}
      </div>

      <div className="rhythm__legend" aria-hidden="true">
        <span className="rhythm__legend-word">✓ 作れる</span>
        {[0, 1, 2, 3, 4, 5].map((l) => (
          <span
            key={l}
            className={`rhythm__swatch rhythm__cell--l${l}${l >= 4 ? ' rhythm__cell--hatch' : ''}`}
          />
        ))}
        <span className="rhythm__legend-word">× 切れがち</span>
      </div>

      {/* ---- hourly crowding strip --------------------------------------- */}
      <div className="rhythm__queue-head">
        <span className="rhythm__queue-title">時間帯別の混み具合</span>
        <span className="rhythm__stamp">行列の投稿から集計</span>
      </div>
      <div className="rhythm__bars" role="img" aria-label="時間帯別の平均待ち人数">
        {rhythm.queueLoad.map((q) => {
          const title =
            q.samples === 0
              ? `${q.hour}時台: 行列の投稿なし`
              : `${q.hour}時台: 平均${q.avgPeople.toFixed(1)}人待ち（${q.samples}件）`;
          const height = maxLoad > 0 ? Math.max(6, Math.round((q.avgPeople / maxLoad) * 100)) : 6;
          return (
            <span key={q.hour} className="rhythm__bar-slot" title={title} aria-label={title}>
              <span
                className={`rhythm__bar${q.samples === 0 ? ' rhythm__bar--none' : ''}`}
                style={{ height: `${height}%` }}
              />
            </span>
          );
        })}
      </div>

      {/* ---- headline slots ---------------------------------------------- */}
      <div className="rhythm__slots">
        <div className="rhythm__slot">
          <span className="rhythm__slot-eyebrow">要注意タイム</span>
          {rhythm.warn ? (
            <strong className="rhythm__slot-value rhythm__slot-value--warn">
              ⚠ {rhythm.warn.label}
            </strong>
          ) : (
            <span className="rhythm__slot-none">まだ傾向が出ていません</span>
          )}
        </div>
        <div className="rhythm__slot">
          <span className="rhythm__slot-eyebrow">ねらい目</span>
          {rhythm.best ? (
            <strong className="rhythm__slot-value rhythm__slot-value--best">
              ◎ {rhythm.best.label}
            </strong>
          ) : (
            <span className="rhythm__slot-none">まだ傾向が出ていません</span>
          )}
        </div>
      </div>

      <p className="rhythm__note">
        みんなの投稿 {rhythm.totalCount} 件から集計（直近4週間）。投稿が少ない時間帯は
        薄く表示されます。
      </p>
    </div>
  );
}
