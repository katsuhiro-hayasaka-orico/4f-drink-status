import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from '../../shared/config.js';
import {
  ACTION_META,
  DRINK_LABELS,
  emptyDrinkTally,
  QUEUE_META,
  QUEUE_SUBJECT,
  SUBJECT_LABELS,
  type ActionKey,
  type QueueLevel,
  type DrinkTally,
  type Report,
  type ReportValue,
  type SubjectKey,
} from '../../shared/domain.js';
import { buildDrinkReportRows, type DrinkReportInput } from '../../shared/drinkReport.js';
import {
  ApiError,
  deleteReport,
  deleteReportGroup,
  fetchReports,
  postDrinkReport,
  postReport,
} from '../lib/api.js';
import { secondsSinceLoad, track } from '../lib/metrics.js';

export interface Toast {
  /** `thanks` appears once the undo window closes without an undo. */
  kind: 'undo' | 'error' | 'thanks';
  text: string;
}

/** Confirms what was posted, and what it changed. */
function postedToast(subject: SubjectKey, value: ReportValue): string {
  if (subject === QUEUE_SUBJECT) {
    return `行列を「${QUEUE_META[value as QueueLevel].label}」で投稿しました。いまの混雑を再集計しました`;
  }
  const action = value as ActionKey;
  if (subject === 'machine') {
    return `マシンを「${action === 'unavailable' ? '故障中' : '復旧した'}」で投稿しました。再集計しました`;
  }
  const levelNote = `（推定残量 ${ACTION_META[action].level}%）`;
  return `${SUBJECT_LABELS[subject]}を「${ACTION_META[action].label}」で投稿しました。みんなの観測を再集計しました${levelNote}`;
}

/** Same, for a drink report — names the drink and what it implied. */
function postedDrinkToast(input: DrinkReportInput): string {
  const name = DRINK_LABELS[input.drink];
  if (input.result === 'made') {
    return input.low.length > 0
      ? `${name}を「作れた」で投稿しました（${input.low
          .map((m) => SUBJECT_LABELS[m])
          .join('・')}は残り少なめとして再集計）`
      : `${name}を「作れた」で投稿しました。使った材料を「十分にある」として再集計しました`;
  }
  const causeText =
    input.cause === 'machine'
      ? 'マシンの故障'
      : input.cause === 'unknown'
        ? '原因は不明'
        : `${SUBJECT_LABELS[input.cause!]}切れ`;
  return `${name}を「作れなかった（${causeText}）」で投稿しました。再集計しました`;
}

/**
 * Everything the board needs from the server, plus the optimistic posting and
 * undo dance on top of it.
 *
 * Posting writes to local state first so the tanks and meters move on the tap
 * rather than on the round trip. The server's copy replaces it as soon as it
 * lands; if the write fails, the optimistic row is rolled back and the toast
 * turns into an error.
 */
export function useDrinkStatus() {
  const [reports, setReports] = useState<Report[]>([]);
  const [drinkTotals, setDrinkTotals] = useState<DrinkTally>(emptyDrinkTally);
  const [me, setMe] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [autoOn, setAutoOn] = useState<boolean>(CONFIG.autoRefresh);

  // Difference between the server's clock and this browser's, so relative
  // times don't drift on a machine with a wrong clock.
  const [skewMs, setSkewMs] = useState(0);
  const [tick, setTick] = useState(0);

  /**
   * What the toast can take back, once the server has confirmed it: a single
   * report row, or a whole fanned-out drink posting (group).
   */
  const undoTargetId = useRef<{ kind: 'report' | 'group'; id: string } | null>(null);
  /** Set when undo is tapped before the POST has come back. */
  const undoRequested = useRef(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thanksTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Bumped whenever local state changes authoritatively outside the poll
   * (optimistic insert, post/undo responses, rollbacks). A poll GET that was
   * already in flight when that happened is a snapshot of the older world;
   * adopting it would erase the newer rows until the next poll. The
   * generation check discards those stale responses instead.
   */
  const generation = useRef(0);

  const adopt = useCallback(
    (res: { reports: Report[]; drinkTotals: DrinkTally; me: string; serverNow: number }) => {
      setReports(res.reports);
      setDrinkTotals(res.drinkTotals);
      setMe(res.me);
      setSkewMs(res.serverNow - Date.now());
    },
    [],
  );

  const refresh = useCallback(async () => {
    const startedAt = generation.current;
    try {
      const res = await fetchReports();
      if (startedAt !== generation.current) return; // a mutation won the race
      adopt(res);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '読み込みに失敗しました');
    }
  }, [adopt]);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  // While 自動更新 is ON, re-poll and re-render so「N分前」stays honest.
  useEffect(() => {
    if (!autoOn) return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      void refresh();
    }, CONFIG.refreshIntervalMs);
    return () => clearInterval(id);
  }, [autoOn, refresh]);

  // Coming back to the tab refreshes immediately: background timers get
  // coalesced by the browser, and the first thing a returning user should
  // see is the present, not the last throttled poll.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
      if (thanksTimer.current) clearTimeout(thanksTimer.current);
    },
    [],
  );

  const showError = useCallback((text: string) => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setToast({ kind: 'error', text });
    errorTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const post = useCallback(
    async (subject: SubjectKey, action: ReportValue) => {
      if (posting) return;
      setPosting(true);

      // A stale error toast's timer would otherwise fire mid-undo-window and
      // clear the undo toast this post is about to show.
      if (errorTimer.current) clearTimeout(errorTimer.current);

      generation.current += 1;
      const optimisticId = `pending-${crypto.randomUUID()}`;
      const optimistic: Report = {
        id: optimisticId,
        subject,
        action,
        userId: me,
        userLabel: '利用者（あなた）',
        createdAt: Date.now() + skewMs,
      };
      setReports((prev) => [optimistic, ...prev]);

      setToast({ kind: 'undo', text: postedToast(subject, action) });

      undoTargetId.current = null;
      undoRequested.current = false;
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => {
        undoTargetId.current = null;
        // The undo window closing without an undo is the moment the post is
        // truly settled — which makes it the honest moment to say thanks and
        // invite feedback. An undone post never reaches this line: undo()
        // clears this timer, and a failed POST clears it in the catch.
        // Settled is also what post_done measures, for the same reason.
        track('post_done', secondsSinceLoad());
        setToast((t) =>
          t?.kind === 'undo' ? { kind: 'thanks', text: '投稿ありがとうございます！' } : t,
        );
        if (thanksTimer.current) clearTimeout(thanksTimer.current);
        thanksTimer.current = setTimeout(
          () => setToast((t) => (t?.kind === 'thanks' ? null : t)),
          6_000,
        );
      }, CONFIG.undoWindowMs);

      try {
        const res = await postReport(subject, action);
        generation.current += 1;
        adopt(res);
        setLoadError(null);

        if (undoRequested.current) {
          // Undo was tapped while the post was still in flight.
          undoRequested.current = false;
          const deleted = await deleteReport(res.report.id);
          generation.current += 1;
          adopt(deleted);
        } else {
          undoTargetId.current = { kind: 'report', id: res.report.id };
        }
      } catch (err) {
        generation.current += 1;
        setReports((prev) => prev.filter((r) => r.id !== optimisticId));
        if (undoTimer.current) clearTimeout(undoTimer.current);
        showError(err instanceof ApiError ? err.message : '投稿に失敗しました');
      } finally {
        setPosting(false);
      }
    },
    [adopt, me, posting, showError, skewMs],
  );

  /**
   * A drink report. Same optimistic dance as post(), but one posting fans
   * out into several rows — the same expansion the server does, so the
   * meters move on the tap exactly the way they will settle.
   */
  const postDrink = useCallback(
    async (input: DrinkReportInput) => {
      if (posting) return;
      setPosting(true);
      if (errorTimer.current) clearTimeout(errorTimer.current);

      generation.current += 1;
      const stamp = Date.now() + skewMs;
      const optimisticIds: string[] = [];
      const optimisticRows: Report[] = buildDrinkReportRows(input).map((seed) => {
        const id = `pending-${crypto.randomUUID()}`;
        optimisticIds.push(id);
        return {
          id,
          subject: seed.subject,
          action: seed.action,
          userId: me,
          userLabel: '利用者（あなた）',
          createdAt: stamp,
        };
      });
      setReports((prev) => [...optimisticRows, ...prev]);

      setToast({ kind: 'undo', text: postedDrinkToast(input) });

      undoTargetId.current = null;
      undoRequested.current = false;
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => {
        undoTargetId.current = null;
        track('post_done', secondsSinceLoad());
        setToast((t) =>
          t?.kind === 'undo' ? { kind: 'thanks', text: '投稿ありがとうございます！' } : t,
        );
        if (thanksTimer.current) clearTimeout(thanksTimer.current);
        thanksTimer.current = setTimeout(
          () => setToast((t) => (t?.kind === 'thanks' ? null : t)),
          6_000,
        );
      }, CONFIG.undoWindowMs);

      try {
        const res = await postDrinkReport(input);
        generation.current += 1;
        adopt(res);
        setLoadError(null);

        if (undoRequested.current) {
          undoRequested.current = false;
          const deleted = await deleteReportGroup(res.groupId);
          generation.current += 1;
          adopt(deleted);
        } else {
          undoTargetId.current = { kind: 'group', id: res.groupId };
        }
      } catch (err) {
        generation.current += 1;
        setReports((prev) => prev.filter((r) => !optimisticIds.includes(r.id)));
        if (undoTimer.current) clearTimeout(undoTimer.current);
        showError(err instanceof ApiError ? err.message : '投稿に失敗しました');
      } finally {
        setPosting(false);
      }
    },
    [adopt, me, posting, showError, skewMs],
  );

  const undo = useCallback(async () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setToast(null);
    track('post_undone');

    const target = undoTargetId.current;
    if (!target) {
      // The post hasn't landed yet — drop the optimistic rows now and delete
      // the real ones the moment they exist.
      undoRequested.current = true;
      setReports((prev) => prev.filter((r) => !r.id.startsWith('pending-')));
      return;
    }

    undoTargetId.current = null;
    try {
      const res =
        target.kind === 'group' ? await deleteReportGroup(target.id) : await deleteReport(target.id);
      generation.current += 1;
      adopt(res);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : '取り消しに失敗しました');
      void refresh();
    }
  }, [adopt, refresh, showError]);

  const toggleAuto = useCallback(() => setAutoOn((v) => !v), []);

  /**
   * Idempotent "make sure polling is on", for callers that decide across an
   * await (the notification toggle). A blind toggle there would flip the
   * value the user set while the permission prompt was open.
   */
  const ensureAutoOn = useCallback(() => setAutoOn(true), []);

  /** Current time on the server's clock, refreshed whenever the board does. */
  const now = useMemo(() => Date.now() + skewMs, [skewMs, reports, tick]);

  return {
    reports,
    drinkTotals,
    me,
    now,
    loading,
    loadError,
    posting,
    toast,
    autoOn,
    toggleAuto,
    ensureAutoOn,
    post,
    postDrink,
    undo,
    refresh,
  };
}
