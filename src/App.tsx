import { useEffect, useMemo, useState } from 'react';
import {
  aggregate,
  focusSummary,
  overallState,
  summarizeQueue,
  type Summary,
} from '../shared/aggregate.js';
import { CONFIG, OBSERVATION_WINDOW_MS } from '../shared/config.js';
import {
  QUEUE_SUBJECT,
  SUBJECT_LABELS,
  type ConfidenceKey,
  type SubjectKey,
} from '../shared/domain.js';
import { loungeHours } from '../shared/hours.js';
import { relativeTime } from '../shared/time.js';

import { AboutDialog } from './components/AboutDialog.js';
import { DrinkAvailability } from './components/DrinkAvailability.js';
import { Header } from './components/Header.js';
import { IngredientLevels } from './components/IngredientLevels.js';
import { MachineIllustration } from './components/MachineIllustration.js';
import { Observations } from './components/Observations.js';
import { QueuePanel } from './components/QueuePanel.js';
import { ReportBreakdown, type FilterKey } from './components/ReportBreakdown.js';
import { ReportForm } from './components/ReportForm.js';
import { Section } from './components/Section.js';
import { SummaryPanel, type Metric } from './components/SummaryPanel.js';
import { ToastBar } from './components/ToastBar.js';
import { useDrinkStatus } from './hooks/useDrinkStatus.js';
import { useNotifications } from './hooks/useNotifications.js';
import { useTheme } from './hooks/useTheme.js';
import { PALETTE } from './lib/palette.js';

const CONFIDENCE_SHORT: Record<ConfidenceKey, string> = {
  high: '高',
  medium: '中',
  low: '低',
  none: '情報なし',
};

const CONFIDENCE_COLOR: Record<ConfidenceKey, string> = {
  high: PALETTE.available,
  medium: PALETTE.low,
  low: PALETTE.unavailable,
  none: PALETTE.unavailable,
};

function buildMetrics(
  focus: Summary | undefined,
  lastUpdated: string,
  validVotes: number,
  recentPeople: number,
  dayPeople: number,
): Metric[] {
  const confidence = focus?.confidence ?? 'none';
  return [
    { label: '最終更新', value: lastUpdated },
    {
      label: `過去${CONFIG.observationWindowMin}分の有効観測`,
      value: `${validVotes}票・${recentPeople}人`,
    },
    {
      label: '観測の確からしさ',
      value: CONFIDENCE_SHORT[confidence],
      color: CONFIDENCE_COLOR[confidence],
    },
    { label: '直近24時間の協力者', value: `${dayPeople}人` },
  ];
}

export function App() {
  const {
    reports,
    me,
    now,
    loadError,
    posting,
    toast,
    autoOn,
    toggleAuto,
    ensureAutoOn,
    post,
    undo,
  } = useDrinkStatus();

  const { preference: themePreference, choose: chooseTheme } = useTheme();
  const { state: notifyState, toggle: toggleNotify, observe: observeReports } = useNotifications();
  const [selectedSubject, setSelectedSubject] = useState<SubjectKey>('coffeeBeans');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [aboutOpen, setAboutOpen] = useState(false);

  // Every fresh copy of the reports goes past the notifier, whether it came
  // from the poll, a post, or an undo.
  useEffect(() => {
    observeReports(reports, me);
  }, [observeReports, reports, me]);

  const onToggleNotify = () => {
    void toggleNotify()
      .then((enabled) => {
        // Notifications ride the poll; enabling them with the poll off would
        // be agreeing to news and then unplugging the radio. ensureAutoOn is
        // idempotent, so neither a stale closure (the permission prompt kept
        // this callback waiting) nor a double click can flip polling off.
        if (enabled) ensureAutoOn();
      })
      .catch(() => {
        /* toggle() contains its own failure handling; never crash the click */
      });
  };

  const view = useMemo(() => {
    const { summaries, statuses, levels } = aggregate(reports, now);
    const overall = overallState(statuses, SUBJECT_LABELS);
    const focus = focusSummary(summaries, statuses);
    const queue = summarizeQueue(reports, now);
    const hours = loungeHours(now);

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
      queue,
      hours,
      lastUpdated,
      metrics: buildMetrics(focus, lastUpdated, validVotes, recentPeople, dayPeople),
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

        <section className="overview" aria-label="ドリンクマシンの全体状況">
          {CONFIG.showMachine && (
            <div className="machine-card">
              <MachineIllustration levels={view.levels} />
            </div>
          )}
          <SummaryPanel overall={view.overall} metrics={view.metrics} hours={view.hours} />
        </section>

        <Section
          title="行列の待ち状況"
          note={`過去${CONFIG.queueWindowMin}分の投稿から集約`}
          footnote="混雑はすぐ変わるため、材料より短い集計ウィンドウを使い、新しい投稿ほど強く重み付けしています。"
        >
          <QueuePanel summary={view.queue} now={now} />
        </Section>

        <Section title="材料の推定残量" note="みんなの投稿に基づく目安です">
          <IngredientLevels statuses={view.statuses} levels={view.levels} />
        </Section>

        <Section title="ドリンクの作成可否">
          <DrinkAvailability statuses={view.statuses} />
        </Section>

        <ReportForm
          hours={view.hours}
          selected={selectedSubject}
          onSelect={setSelectedSubject}
          onPost={(action) => void post(selectedSubject, action)}
          posting={posting}
        />

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

        <footer className="footer">
          <span>集合知 — 利用者ごとの最新投稿を1票として集計しています</span>
          <button type="button" className="footer__link" onClick={() => setAboutOpen(true)}>
            このアプリについて
          </button>
        </footer>
      </main>

      {toast && <ToastBar toast={toast} onUndo={() => void undo()} />}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
