import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UNKNOWN_LEVELS,
  UNKNOWN_STATUSES,
  aggregate,
  focusSummary,
  overallState,
  summarizeDrinkReports,
  summarizeQueue,
} from '../shared/aggregate.js';
import { CONFIG, OBSERVATION_WINDOW_MS } from '../shared/config.js';
import {
  DRINK_KEYS,
  QUEUE_SUBJECT,
  SUBJECT_LABELS,
  type ConfidenceKey,
  type DrinkKey,
  type DrinkResult,
} from '../shared/domain.js';
import { loungeHours } from '../shared/hours.js';
import { relativeTime } from '../shared/time.js';

import { AboutDialog } from './components/AboutDialog.js';
import { DrinkAvailability } from './components/DrinkAvailability.js';
import { DrinkPopularity } from './components/DrinkPopularity.js';
import { FeedbackDialog } from './components/FeedbackDialog.js';
import { Header } from './components/Header.js';
import { IngredientLevels } from './components/IngredientLevels.js';
import { MachineIllustration } from './components/MachineIllustration.js';
import { Observations } from './components/Observations.js';
import { QrDialog } from './components/QrDialog.js';
import { QueuePanel } from './components/QueuePanel.js';
import { ReportBreakdown, type FilterKey } from './components/ReportBreakdown.js';
import { ReportForm } from './components/ReportForm.js';
import { Section } from './components/Section.js';
import { SummaryPanel, type Metric } from './components/SummaryPanel.js';
import { ToastBar } from './components/ToastBar.js';
import { FeedbackBox } from './components/FeedbackBox.js';
import { useDrinkStatus } from './hooks/useDrinkStatus.js';
import { useFeedback } from './hooks/useFeedback.js';
import { useInView } from './hooks/useInView.js';
import { useNotifications } from './hooks/useNotifications.js';
import { useTheme } from './hooks/useTheme.js';
import { markPrompted, shouldAutoPrompt } from './lib/feedbackPrompt.js';
import { track } from './lib/metrics.js';

const CONFIDENCE_SHORT: Record<ConfidenceKey, string> = {
  high: '高',
  medium: '中',
  low: '低',
  none: '情報なし',
};

// 確からしさ is no longer a metrics row — it moved into the headline as a
// pill, right next to the verdict it qualifies.
function buildMetrics(
  lastUpdated: string,
  validVotes: number,
  recentPeople: number,
  dayPeople: number,
): Metric[] {
  return [
    { label: '最終更新', value: lastUpdated },
    {
      label: `過去${CONFIG.observationWindowMin}分の有効観測`,
      value: `${validVotes}票・${recentPeople}人`,
    },
    { label: '直近24時間の協力者', value: `${dayPeople}人` },
  ];
}

export function App() {
  const {
    reports,
    drinkTotals,
    me,
    now,
    loadError,
    posting,
    toast,
    autoOn,
    toggleAuto,
    post,
    postDrink,
    undo,
  } = useDrinkStatus();

  const { preference: themePreference, choose: chooseTheme } = useTheme();
  const { state: notifyState, toggle: toggleNotify } = useNotifications();
  const feedback = useFeedback();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState<'auto' | 'manual' | null>(null);

  // The thanks toast is the cue: if this device hasn't submitted or dismissed
  // the form within the cooldown, the dialog opens itself. The toast's small
  // link stays available every time regardless.
  useEffect(() => {
    if (toast?.kind !== 'thanks') return;
    if (feedbackOpen === null && shouldAutoPrompt(Date.now())) setFeedbackOpen('auto');
  }, [toast, feedbackOpen]);

  // Submitting *or* closing counts as "asked recently" — someone who waved
  // the form away should not see it again tomorrow. Stable identity, so the
  // dialog's Escape listener isn't re-bound on every poll re-render.
  const closeFeedback = useCallback(() => {
    markPrompted(Date.now());
    setFeedbackOpen(null);
  }, []);

  // Report-form visibility: hides the floating CTA while the real form is
  // reachable, and fires the one-shot report_view metric (the audit's
  // "did they ever find it" number). `null` = not measured yet — neither.
  const { ref: reportRef, inView: reportInView } = useInView<HTMLDivElement>();
  const reportViewTracked = useRef(false);
  useEffect(() => {
    if (reportInView === true && !reportViewTracked.current) {
      reportViewTracked.current = true;
      track('report_view');
    }
  }, [reportInView]);

  const goToReport = useCallback(() => {
    track('cta_click');
    const el = document.getElementById('report');
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    // Land keyboard/AT focus on step 1 once the scroll has had its moment.
    window.setTimeout(
      () => el.querySelector<HTMLButtonElement>('.chip')?.focus({ preventScroll: true }),
      reduce ? 0 : 400,
    );
  }, []);

  // Notifications are server-pushed now — no poll coupling, no report
  // observation. The toggle is self-contained; just never crash the click.
  const onToggleNotify = () => {
    void toggleNotify().catch(() => {});
  };

  const view = useMemo(() => {
    const agg = aggregate(reports, now);
    const hours = loungeHours(now);
    // Outside opening hours the "current state" panels have no current state
    // to report: nobody can use the machine, and whatever was true at 17:00
    // will not be verified again until morning. History sections (観測・内訳)
    // keep showing what was actually posted.
    const closed = hours.state === 'closed';
    const summaries = agg.summaries;
    const statuses = closed ? UNKNOWN_STATUSES : agg.statuses;
    const levels = closed ? UNKNOWN_LEVELS : agg.levels;
    // The 清掃中 sign only counts while the board is open and the machine
    // reading is actually an outage.
    const machineCleaning =
      statuses.machine === 'unavailable' &&
      summaries.find((s) => s.subject === 'machine')?.dominantAction === 'cleaning';
    const overall = overallState(statuses, SUBJECT_LABELS, machineCleaning);
    const focus = focusSummary(summaries, agg.statuses);
    const confidence = closed ? ('none' as const) : (focus?.confidence ?? 'none');
    const queue = summarizeQueue(reports, now);
    // Direct made/failed verdicts per drink; masked while closed like the rest.
    const drinkDirect = Object.fromEntries(
      DRINK_KEYS.map((k) => [k, closed ? null : summarizeDrinkReports(reports, k, now)]),
    ) as Record<DrinkKey, DrinkResult | null>;

    const latest = reports.reduce<number | null>(
      (max, r) => (max === null || r.createdAt > max ? r.createdAt : max),
      null,
    );
    const lastUpdated = latest === null ? '情報なし' : relativeTime(latest, now);

    // Both halves of 「N票・M人」 count supply reports only, so the metric stays
    // internally consistent — queue reports live on a different window and are
    // surfaced by the queue panel instead.
    const validVotes = summaries.reduce((sum, s) => sum + s.total, 0);
    const recentPeople = new Set(
      reports
        .filter((r) => r.subject !== QUEUE_SUBJECT && now - r.createdAt <= OBSERVATION_WINDOW_MS)
        .map((r) => r.userId),
    ).size;
    const dayPeople = new Set(
      reports.filter((r) => now - r.createdAt <= 86_400_000).map((r) => r.userId),
    ).size;

    return {
      summaries,
      statuses,
      levels,
      overall,
      confidence,
      queue,
      drinkDirect,
      machineCleaning,
      hours,
      lastUpdated,
      metrics: buildMetrics(lastUpdated, validVotes, recentPeople, dayPeople),
    };
  }, [reports, now]);

  return (
    <div className="page">
      <Header
        lastUpdated={view.lastUpdated}
        autoOn={autoOn}
        onToggleAuto={toggleAuto}
        hours={view.hours}
        notifyState={notifyState}
        onToggleNotify={onToggleNotify}
        themePreference={themePreference}
        onThemeChange={chooseTheme}
      />

      <main className="main">
        {loadError && (
          <p role="alert" className="section__footnote" style={{ marginTop: 0 }}>
            {loadError}（表示は前回取得した内容です）
          </p>
        )}

        {/* One short line for screen readers instead of the old whole-board
            live region: only the verdict, only when it changes. */}
        <p className="visually-hidden" aria-live="polite">
          {view.overall.label}・確からしさ{CONFIDENCE_SHORT[view.confidence]}
        </p>

        <section className="overview" aria-label="ドリンクマシンの全体状況">
          {CONFIG.showMachine && (
            <div className="machine-card">
              <MachineIllustration levels={view.levels} />
            </div>
          )}
          <SummaryPanel
            overall={view.overall}
            confidence={view.confidence}
            metrics={view.metrics}
            hours={view.hours}
            onReport={goToReport}
          />
        </section>

        {/* The audit's core finding: the form sat 1.6 screens down and the
            page read as view-only. Posting now comes right after the hero. */}
        <div ref={reportRef}>
          <ReportForm
            hours={view.hours}
            posting={posting}
            onPostDrink={(input) => void postDrink(input)}
            onPostSimple={(subject, action) => void post(subject, action)}
            onPostQueue={(level) => void post(QUEUE_SUBJECT, level)}
          />
        </div>

        <Section
          title="行列の待ち状況"
          note={`過去${CONFIG.queueWindowMin}分の投稿から集約`}
          footnote="混雑はすぐ変わるため、材料より短い集計ウィンドウを使い、新しい投稿ほど強く重み付けしています。"
        >
          <QueuePanel
            summary={view.queue}
            now={now}
            posting={posting}
            onPostQueue={(level) => void post(QUEUE_SUBJECT, level)}
          />
        </Section>

        <Section title="材料の推定残量" note="作れたドリンクの報告から推定した目安です">
          <IngredientLevels statuses={view.statuses} levels={view.levels} />
        </Section>

        <Section title="ドリンクの作成可否" note="要約のみ・詳細は開いて確認">
          <DrinkAvailability
            statuses={view.statuses}
            direct={view.drinkDirect}
            machineCleaning={view.machineCleaning}
          />
        </Section>

        <Section
          title="ドリンクの人気度"
          ariaLabel="ドリンクの人気度"
          note="これまでの報告の累計"
          footnote="「作れた」「作れなかった」の報告回数の合計で並べています。よく報告されるドリンクほど、よく作られているドリンクです。"
        >
          <DrinkPopularity totals={drinkTotals} />
        </Section>

        <Section
          title="みんなの観測"
          ariaLabel="みんなの観測"
          note={`投稿者数・一致率・新しさから集約　—　過去${CONFIG.observationWindowMin}分`}
          footnote="同じ利用者の最新投稿だけを1票として集計します。3人以上・75％以上一致・最終観測10分以内で「確からしさ：高」です。"
        >
          <Observations summaries={view.summaries} now={now} />
        </Section>

        <Section title="投稿の内訳" note={`直近の投稿${CONFIG.reportTableLimit}件まで`}>
          <ReportBreakdown
            reports={reports}
            me={me}
            now={now}
            filter={filter}
            onFilter={setFilter}
          />
        </Section>

        <Section
          title="ご意見箱"
          ariaLabel="ご意見箱"
          note="サイトへのご意見・ご感想（非公開）"
          footnote="お寄せいただいた声はサイトの改善に使わせていただきます。内容が画面や API に表示されることはありません。"
        >
          <FeedbackBox tally={feedback.tally} onWrite={() => setFeedbackOpen('manual')} />
        </Section>

        <footer className="footer">
          <span>集合知 — 利用者ごとの最新投稿を1票として集計しています</span>
          <span className="footer__links">
            <button type="button" className="footer__link" onClick={() => setQrOpen(true)}>
              QRコードで紹介
            </button>
            <button type="button" className="footer__link" onClick={() => setAboutOpen(true)}>
              このアプリについて
            </button>
          </span>
        </footer>
      </main>

      {/* Floating fallback CTA: only once we know the form is off-screen. */}
      {reportInView === false && (
        <button type="button" className="report-fab" onClick={goToReport}>
          ＋ 投稿する
        </button>
      )}

      {toast && (
        <ToastBar
          toast={toast}
          onUndo={() => void undo()}
          onFeedback={() => setFeedbackOpen('manual')}
        />
      )}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {qrOpen && <QrDialog onClose={() => setQrOpen(false)} />}
      {feedbackOpen && (
        <FeedbackDialog variant={feedbackOpen} onSubmit={feedback.submit} onClose={closeFeedback} />
      )}
    </div>
  );
}
