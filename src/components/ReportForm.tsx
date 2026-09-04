import { useEffect, useRef, useState } from 'react';
import {
  MATERIAL_KEYS,
  QUEUE_LEVELS,
  QUEUE_META,
  SIGHTING_ACTIONS,
  SUBJECT_LABELS,
  actionLabelFor,
  type ActionKey,
  type DrinkKey,
  type MaterialKey,
  type QueueLevel,
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
  /** The queue follow-up posts through here (a plain queue report). */
  onPostQueue: (level: QueueLevel) => void;
  /**
   * A material sent over from the levels card, to be pre-selected in the
   * sighting picker. Someone tapping 「見かけた残量を報告」 next to 氷 has
   * already answered step one, so we must not ask it again.
   */
  sightingTarget: MaterialKey | null;
  /** Cleared once the pre-selection has been taken, so it can fire again. */
  onSightingTargetUsed: () => void;
}

/**
 * Two ways in, both first class.
 *
 * **Made a drink** — 「どのドリンク？」→「作れましたか？」. People experience
 * the machine as drinks, not as hoppers, so the form asks about drinks and the
 * server derives the material levels. The happy path is two taps. 「作れたが
 * 残り少なそう」 opens an optional detail step; 「作れなかった」 requires
 * naming a cause — an ingredient, the machine, or an honest わからない —
 * because a failure without a culprit must not guess at one.
 *
 * **Only looked** — 「どの材料？」→「どのくらい？」. The hoppers are
 * transparent, so a passer-by often knows more about the cocoa than the last
 * person to make coffee does. This half used to be two rows of small chips
 * under the fine print, offering only 補充された and 残り少なめ; someone who
 * could see three full hoppers had no way to say so and posted drinks they had
 * not made just to get the levels recorded. That is a bug in the form, not in
 * the person: the state they wanted was 「十分にある」 and it was missing.
 *
 * 「なくなっている」 stays out of the sighting half on purpose — see
 * SIGHTING_ACTIONS in shared/domain.ts.
 *
 * Nothing starts selected in either half (a pre-chosen drink plus a tapped
 * result would silently misreport), and the second question's buttons stay
 * disabled until the first is answered. Queue reporting lives with the queue
 * panel — but a drink posting flows straight into an optional queue follow-up,
 * because the person who just used the machine also just walked past the line,
 * and the split form placement was costing us exactly those reports.
 */
export function ReportForm({
  hours,
  posting,
  onPostDrink,
  onPostSimple,
  onPostQueue,
  sightingTarget,
  onSightingTargetUsed,
}: ReportFormProps) {
  const [drink, setDrink] = useState<DrinkKey | null>(null);
  /** Which detail step is open: low-materials picker or failure causes. */
  const [detail, setDetail] = useState<'low' | 'failed' | null>(null);
  const [lowSel, setLowSel] = useState<MaterialKey[]>([]);
  /** After a drink posting, the form becomes the queue follow-up once. */
  const [followup, setFollowup] = useState(false);
  /** Which material the sighting picker is asking about. */
  const [sighting, setSighting] = useState<MaterialKey | null>(null);
  const sightingStateRef = useRef<HTMLDivElement>(null);
  const sightingRef = useRef<HTMLDivElement>(null);
  const focusTimer = useRef<number>();

  useEffect(() => () => window.clearTimeout(focusTimer.current), []);

  // Arriving from the levels card: take the material, then move the keyboard to
  // the question still open. The focus waits for the page's smooth scroll to
  // settle, and the timer is deliberately NOT cleared by this effect — taking
  // the target clears it, which would re-run the effect and cancel the very
  // timeout it just set.
  useEffect(() => {
    if (!sightingTarget) return;
    setSighting(sightingTarget);
    onSightingTargetUsed();
    window.clearTimeout(focusTimer.current);
    focusTimer.current = window.setTimeout(() => {
      sightingStateRef.current?.querySelector('button')?.focus({ preventScroll: true });
    }, 450);
  }, [sightingTarget, onSightingTargetUsed]);

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
    setFollowup(true);
  };

  const postFailed = (cause: DrinkReportInput['cause']) => {
    if (!drink) return;
    onPostDrink({ drink, result: 'failed', low: [], cause });
    reset();
    setFollowup(true);
  };

  const postQueue = (level: QueueLevel) => {
    onPostQueue(level);
    setFollowup(false);
  };

  const postSighting = (action: ActionKey) => {
    if (!sighting) return;
    onPostSimple(sighting, action);
    setSighting(null);
  };

  const toggleLow = (m: MaterialKey) =>
    setLowSel((sel) => (sel.includes(m) ? sel.filter((x) => x !== m) : [...sel, m]));

  return (
    <section id="report" className="section" aria-label="今の状態を投稿">
      <div className="report">
        <div className="report__head">
          <h2 className="section__title">いまの様子を教えてください</h2>
          <span className="section__note">
            ドリンクを作った人も、見かけただけの人も投稿できます
          </span>
        </div>

        {/* On a phone the drink chips stack to eight rows, which puts the other
            half of the form more than a screen away. This is the shortcut for
            the person who did not make anything — the exact person who was
            posting drinks they had not made because they never scrolled far
            enough to find it. */}
        <button
          type="button"
          className="report__jump"
          onClick={() => {
            const el = sightingRef.current;
            if (!el) return;
            const reduce =
              window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
            el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
            window.setTimeout(
              () => el.querySelector<HTMLButtonElement>('.chip')?.focus({ preventScroll: true }),
              reduce ? 0 : 400,
            );
          }}
        >
          作っていない ─ 見かけた残量だけ報告する
        </button>

        {/* Posting stays available outside opening hours — restocking happens
            then, and a refill is worth recording whenever it is seen. */}
        {hours.state === 'closed' && (
          <p className="report__closed" role="note">
            いまは開放時間外です（{hours.rangeLabel}）。補充などで状態が変わった場合は投稿できます。
          </p>
        )}

        {followup ? (
          /* One drink posting just went out — ride the momentum and ask the
             one question this person can answer better than anyone: they are
             literally looking at the line. Optional, one tap, skippable. */
          <div className="report__followup" role="group" aria-label="行列の追加報告">
            <p className="report__followup-thanks" aria-live="polite">
              投稿を受け付けました。<strong>あわせて、いまの行列も教えてください</strong>（任意）
            </p>
            <div className="report__step">
              <span className="report__step-no" aria-hidden="true">
                ＋
              </span>
              いま、何人くらい並んでいますか？
            </div>
            <div className="chips">
              {QUEUE_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className="chip"
                  disabled={posting}
                  onClick={() => postQueue(level)}
                >
                  {QUEUE_META[level].label}
                </button>
              ))}
            </div>
            <button type="button" className="report__followup-skip" onClick={() => setFollowup(false)}>
              スキップ（行列は見ていない）
            </button>
          </div>
        ) : (
          <>
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

          </>
        )}

        {/* The other half of the form, and it has to look like a half rather
            than a footnote. Someone who only looked at the hoppers is reporting
            an OBSERVATION — no less reliable than a drink, and the only source
            we have for materials nobody used today. It reads material → state,
            the same shape as the drink flow above, so the two feel like siblings.

            This block sits outside the followup branch on purpose: after a drink
            posting the steps above collapse into the queue question, and a
            sighting stays possible throughout. */}
        <div className="report__others" ref={sightingRef}>
          <h3 className="report__others-title">作っていなくても、見えた残量を報告できます</h3>
          <p className="report__others-lead">
            ホッパーを覗いただけ、誰かが使っているのを見かけただけ、でもかまいません。
          </p>

          <div className="report__step">
            <span className="report__step-no" aria-hidden="true">
              見
            </span>
            どの材料が見えましたか？
          </div>
          <div className="chips">
            {MATERIAL_KEYS.map((m) => (
              <button
                key={m}
                type="button"
                className="chip"
                aria-pressed={sighting === m}
                disabled={posting}
                onClick={() => setSighting(sighting === m ? null : m)}
              >
                <SubjectIcon subject={m} />
                {SUBJECT_LABELS[m]}
              </button>
            ))}
          </div>

          <div className="report__step">
            <span className="report__step-no" aria-hidden="true">
              量
            </span>
            {sighting === null ? (
              'まず材料を選択してください'
            ) : (
              <>
                <strong className="report__target">{SUBJECT_LABELS[sighting]}</strong>
                はどのくらいでしたか？
              </>
            )}
          </div>
          <div className="chips" ref={sightingStateRef}>
            {SIGHTING_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                className="chip"
                disabled={posting || sighting === null}
                onClick={() => postSighting(action)}
              >
                {actionLabelFor(sighting ?? 'coffeeBeans', action)}
              </button>
            ))}
          </div>

          <div className="report__others-machine">
            <span className="report__others-label">マシン自体：</span>
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

        {/* Shared footer: the undo window and the aggregation rule apply to
            both halves, so the note sits under both rather than closing the
            drink flow and implying the sightings below are an afterthought. */}
        <p className="report__note">
          投稿はどちらも{CONFIG.undoWindowMs / 1000}
          秒だけ取り消せます。作れたドリンクが使った材料と、見かけた残量は、どちらも同じように推定に反映されます。
        </p>
      </div>
    </section>
  );
}
