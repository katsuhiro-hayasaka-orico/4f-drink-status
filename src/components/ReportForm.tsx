import type { CSSProperties } from 'react';
import {
  ACTION_KEYS,
  ACTION_META,
  SUBJECT_KEYS,
  SUBJECT_LABELS,
  type ActionKey,
  type SubjectKey,
} from '../../shared/domain.js';
import { CONFIG } from '../../shared/config.js';
import { PALETTE } from '../lib/palette.js';

/** 補充された isn't a status, so it gets the neutral tone rather than green. */
const ACTION_TONE: Record<ActionKey, string> = {
  available: PALETTE.available,
  low: PALETTE.low,
  unavailable: PALETTE.unavailable,
  refilled: '#8a6a50',
};

/** 「取れた 70％／残り少なめ 30％／…」, kept in step with ACTION_META. */
const LEVEL_LEGEND = ACTION_KEYS.map(
  (k) => `${ACTION_META[k].quote} ${ACTION_META[k].level}％`,
).join('／');

export interface ReportFormProps {
  selected: SubjectKey;
  onSelect: (subject: SubjectKey) => void;
  onPost: (action: ActionKey) => void;
  posting: boolean;
}

/** 「対象を選ぶ → 状態を押す」 — two taps, no free text, no login. */
export function ReportForm({ selected, onSelect, onPost, posting }: ReportFormProps) {
  return (
    <section id="report" className="section" aria-label="今の状態を投稿">
      <div className="report">
        <div className="report__head">
          <h2 className="section__title">今の状態をおしえてください</h2>
          <span className="section__note">4Fで確認した状態を、1タップで共有</span>
        </div>

        <div className="report__step">
          <span className="report__step-no" aria-hidden="true">
            1
          </span>
          対象を選択
        </div>
        <div className="chips">
          {SUBJECT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="chip"
              aria-pressed={selected === key}
              onClick={() => onSelect(key)}
            >
              {SUBJECT_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="report__step">
          <span className="report__step-no" aria-hidden="true">
            2
          </span>
          状態を選択して投稿
        </div>
        <div className="actions">
          {ACTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="action"
              style={{ '--tone': ACTION_TONE[key] } as CSSProperties}
              onClick={() => onPost(key)}
              disabled={posting}
            >
              <span className="action__mark" aria-hidden="true">
                {ACTION_META[key].mark}
              </span>
              <span className="action__label">{ACTION_META[key].label}</span>
            </button>
          ))}
        </div>

        <p className="report__note">
          投稿後{CONFIG.undoWindowMs / 1000}
          秒だけ取り消し可能です。材料別の投稿は推定残量へ即時反映します：{LEVEL_LEGEND}。
        </p>
      </div>
    </section>
  );
}
