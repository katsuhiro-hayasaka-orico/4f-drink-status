import { useState } from 'react';
import {
  MATERIAL_KEYS,
  SUBJECT_LABELS,
  type DrinkKey,
  type MaterialKey,
  type ReportValue,
  type SubjectKey,
} from '../../shared/domain.js';
import { RECIPES, RECIPE_BY_KEY } from '../../shared/drinks.js';
import type { DrinkReportInput } from '../../shared/drinkReport.js';
import { CONFIG } from '../../shared/config.js';
import type { LoungeHours } from '../../shared/hours.js';
import { PALETTE } from '../lib/palette.js';
import { SubjectIcon } from './SubjectIcon.js';

export interface ReportFormProps {
  hours: LoungeHours;
  posting: boolean;
  onPostDrink: (input: DrinkReportInput) => void;
  /** Refill sightings and machine down/up — the non-drink reports. */
  onPostSimple: (subject: SubjectKey, action: ReportValue) => void;
}

/**
 * Drink-first reporting: 「どのドリンク？」→「作れましたか？」.
 *
 * People experience the machine as drinks, not as hoppers, so the form asks
 * about drinks and the server derives the material levels. The happy path is
 * still two taps. 「作れたが残り少なそう」 opens an optional detail step;
 * 「作れなかった」 requires naming a cause — an ingredient, the machine, or
 * an honest わからない — because a failure without a culprit must not guess
 * at one.
 *
 * Nothing starts selected (a pre-chosen drink plus a tapped result would
 * silently misreport), and step 2's buttons stay disabled until step 1 is
 * answered. The queue moved out entirely — it lives with the queue panel.
 */
export function ReportForm({ hours, posting, onPostDrink, onPostSimple }: ReportFormProps) {
  const [drink, setDrink] = useState<DrinkKey | null>(null);
  /** Which detail step is open: low-materials picker or failure causes. */
  const [detail, setDetail] = useState<'low' | 'failed' | null>(null);
  const [lowSel, setLowSel] = useState<MaterialKey[]>([]);

  const recipe = drink ? RECIPE_BY_KEY[drink] : null;

  const pickDrink = (key: DrinkKey) => {
    setDrink(key);
    setDetail(null);
    setLowSel([]);
  };

  const reset = () => {
    setDrink(null);
    setDetail(null);
    setLowSel([]);
  };

  const postMade = (low: MaterialKey[]) => {
    if (!drink) return;
    onPostDrink({ drink, result: 'made', low, cause: null });
    reset();
  };

  const postFailed = (cause: DrinkReportInput['cause']) => {
    if (!drink) return;
    onPostDrink({ drink, result: 'failed', low: [], cause });
    reset();
  };

  const toggleLow = (m: MaterialKey) =>
    setLowSel((sel) => (sel.includes(m) ? sel.filter((x) => x !== m) : [...sel, m]));

  return (
    <section id="report" className="section" aria-label="今の状態を投稿">
      <div className="report">
        <div className="report__head">
          <h2 className="section__title">ドリンクを作ってみましたか？</h2>
          <span className="section__note">結果を1タップで共有すると、残量に反映されます</span>
        </div>

        {/* Posting stays available outside opening hours — restocking happens
            then, and a refill is worth recording whenever it is seen. */}
        {hours.state === 'closed' && (
          <p className="report__closed" role="note">
            いまは開放時間外です（{hours.rangeLabel}）。補充などで状態が変わった場合は投稿できます。
          </p>
        )}

        <div className="report__step">
          <span className="report__step-no" aria-hidden="true">
            1
          </span>
          どのドリンクですか？
        </div>
        {[false, true].map((iced) => (
          <div className="chips report__drink-row" key={iced ? 'ice' : 'hot'}>
            <span
              className={`drink-group__badge drink-group__badge--${iced ? 'iced' : 'hot'} report__row-badge`}
              aria-hidden="true"
            >
              {iced ? 'ICE' : 'HOT'}
            </span>
            {RECIPES.filter((r) => r.iced === iced).map((r) => (
              <button
                key={r.key}
                type="button"
                className="chip"
                aria-pressed={drink === r.key}
                onClick={() => pickDrink(r.key)}
              >
                {r.name}
              </button>
            ))}
          </div>
        ))}

        <div className="report__step">
          <span className="report__step-no" aria-hidden="true">
            2
          </span>
          {drink === null ? (
            'まずドリンクを選択してください'
          ) : (
            <>
              <strong className="report__target">{recipe!.name}</strong>
              は作れましたか？
            </>
          )}
        </div>
        <div className="actions actions--results">
          <button
            type="button"
            className="action"
            style={{ '--tone': PALETTE.available } as React.CSSProperties}
            disabled={posting || drink === null}
            onClick={() => postMade([])}
          >
            <span className="action__mark" aria-hidden="true">
              ✓
            </span>
            <span className="action__label">問題なく作れた</span>
          </button>
          <button
            type="button"
            className="action"
            style={{ '--tone': PALETTE.low } as React.CSSProperties}
            aria-expanded={detail === 'low'}
            disabled={posting || drink === null}
            onClick={() => setDetail(detail === 'low' ? null : 'low')}
          >
            <span className="action__mark" aria-hidden="true">
              !
            </span>
            <span className="action__label">作れたが、残り少なそう</span>
          </button>
          <button
            type="button"
            className="action"
            style={{ '--tone': PALETTE.unavailable } as React.CSSProperties}
            aria-expanded={detail === 'failed'}
            disabled={posting || drink === null}
            onClick={() => setDetail(detail === 'failed' ? null : 'failed')}
          >
            <span className="action__mark" aria-hidden="true">
              ×
            </span>
            <span className="action__label">作れなかった</span>
          </button>
        </div>

        {detail === 'low' && recipe && (
          <div className="report__detail">
            <div className="report__step">
              <span className="report__step-no" aria-hidden="true">
                3
              </span>
              残り少なそうだったのは？（複数選択できます）
            </div>
            <div className="chips">
              {recipe.requires.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  aria-pressed={lowSel.includes(m)}
                  onClick={() => toggleLow(m)}
                >
                  <SubjectIcon subject={m} />
                  {SUBJECT_LABELS[m]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="report__submit"
              disabled={posting || lowSel.length === 0}
              onClick={() => postMade(lowSel)}
            >
              この内容で投稿する
            </button>
          </div>
        )}

        {detail === 'failed' && recipe && (
          <div className="report__detail">
            <div className="report__step">
              <span className="report__step-no" aria-hidden="true">
                3
              </span>
              原因はどれでしたか？（選ぶと投稿されます）
            </div>
            <div className="chips">
              {recipe.requires.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  disabled={posting}
                  onClick={() => postFailed(m)}
                >
                  <SubjectIcon subject={m} />
                  {SUBJECT_LABELS[m]}が切れていた
                </button>
              ))}
              <button
                type="button"
                className="chip"
                disabled={posting}
                onClick={() => postFailed('machine')}
              >
                <SubjectIcon subject="machine" />
                マシンの故障
              </button>
              <button type="button" className="chip" disabled={posting} onClick={() => postFailed('unknown')}>
                わからない
              </button>
            </div>
          </div>
        )}

        <p className="report__note">
          投稿後{CONFIG.undoWindowMs / 1000}
          秒だけ取り消し可能です。作れたドリンクが使った材料は「十分にある」として、残量の推定に即時反映されます。
        </p>

        {/* Refills and machine down/up can't be phrased as a drink — the
            small escape hatch below keeps them reportable. */}
        <div className="report__others">
          <span className="report__others-label">補充を見かけたら：</span>
          {MATERIAL_KEYS.map((m) => (
            <button
              key={m}
              type="button"
              className="chip chip--small"
              disabled={posting}
              onClick={() => onPostSimple(m, 'refilled')}
            >
              <SubjectIcon subject={m} />
              {SUBJECT_LABELS[m]}
            </button>
          ))}
          <span className="report__others-label report__others-label--machine">マシン自体：</span>
          <button
            type="button"
            className="chip chip--small"
            disabled={posting}
            onClick={() => onPostSimple('machine', 'unavailable')}
          >
            故障中
          </button>
          <button
            type="button"
            className="chip chip--small"
            disabled={posting}
            onClick={() => onPostSimple('machine', 'cleaning')}
          >
            清掃中
          </button>
          <button
            type="button"
            className="chip chip--small"
            disabled={posting}
            onClick={() => onPostSimple('machine', 'refilled')}
          >
            復旧した
          </button>
        </div>
      </div>
    </section>
  );
}
