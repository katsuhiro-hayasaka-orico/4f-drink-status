import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from '../../shared/config.js';
import {
  milestoneMessage,
  tierNewlyReached,
  type ContributorsResponse,
} from '../../shared/contributors.js';
import {
  DRINK_LABELS,
  emptyDrinkTally,
  QUEUE_META,
  QUEUE_SUBJECT,
  SUBJECT_LABELS,
  reportValueQuote,
  type QueueLevel,
  type DrinkTally,
  type Report,
  type ReportsResponse,
  type ReportValue,
  type SubjectKey,
} from '../../shared/domain.js';
import { buildDrinkReportRows, type DrinkReportInput } from '../../shared/drinkReport.js';
import {
  ApiError,
  deleteReport,
  deleteReportGroup,
  fetchContributors,
  fetchReports,
  postDrinkReport,
  postReport,
} from '../lib/api.js';
import { markCelebrated, nextCelebration, readCelebrated } from '../lib/milestones.js';
import { secondsSinceLoad, track } from '../lib/metrics.js';
import { classifyPostError, type PostOutcome } from '../lib/postOutcome.js';

export interface Toast {
  /**
   * `sending` while the POST is in flight — still undoable, but nothing has
   * been promised yet. `undo` once the server has the row and the window is
   * open. `thanks` once that window closes without an undo, or `celebrate`
   * when that same moment happens to be this device's 10th, 20th, 30th …
   * posting.
   */
  kind: 'sending' | 'undo' | 'error' | 'thanks' | 'celebrate';
  text: string;
}

type UndoTarget = { kind: 'report' | 'group'; id: string };

/** Confirms what was posted, and what it changed. */
function postedToast(subject: SubjectKey, value: ReportValue, level: number | null): string {
  if (subject === QUEUE_SUBJECT) {
    return `行列を「${QUEUE_META[value as QueueLevel].label}」で投稿しました。いまの混雑を再集計しました`;
  }
  if (subject === 'machine') {
    const word =
      value === 'cleaning' ? '清掃中' : value === 'unavailable' ? '故障中' : '復旧した';
    return `マシンを「${word}」で投稿しました。再集計しました`;
  }
  // The band that was pressed, and no promise about the gauge: the number on
  // the card is a mean over everyone's reports now, so quoting a fixed
  // 「推定残量 70%」 here would be wrong as often as not.
  return `${SUBJECT_LABELS[subject]}を「${reportValueQuote(subject, value, level)}」で投稿しました。みんなの観測を再集計しました`;
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
 * lands, and only then does the board call the post a success: the undo
 * window opens on confirmation, not on the tap. If the write fails, the
 * optimistic row is rolled back and the toast turns into an error — and the
 * caller gets told, so a form never claims a post it does not have.
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
  /** 投稿の常連さん — null until its own slower fetch lands (or a mutation carries it). */
  const [contributors, setContributors] = useState<ContributorsResponse | null>(null);

  // Difference between the server's clock and this browser's, so relative
  // times don't drift on a machine with a wrong clock.
  const [skewMs, setSkewMs] = useState(0);
  const [tick, setTick] = useState(0);
  /**
   * Server time of the last snapshot adopted — null until the first one
   * lands, which is also how the board tells "loading" and "never reached
   * the server" apart from "no reports". Every successful path (poll, post,
   * undo) goes through adopt(), so this is set in exactly one place.
   */
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  /**
   * What the toast can take back, once the server has confirmed it: a single
   * report row, or a whole fanned-out drink posting (group).
   */
  const undoTargetId = useRef<UndoTarget | null>(null);
  /** Set when undo is tapped before the POST has come back. */
  const undoRequested = useRef(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thanksTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The milestone toast fires from inside openUndoWindow's timer, which is
   * created once (useCallback with no deps), so everything it reads has to be
   * a ref rather than a captured render value.
   */
  const contributorsRef = useRef<ContributorsResponse | null>(null);
  const meRef = useRef('');
  /** When the contributor counts were last taken, for the 5-minute cadence. */
  const contributorsAt = useRef(0);
  /**
   * The highest milestone celebrated in this tab. localStorage is the durable
   * record; this covers the case where writing it failed (private mode), so at
   * least the same tab doesn't repeat itself.
   */
  const celebratedInSession = useRef(0);

  /**
   * Bumped whenever local state changes authoritatively outside the poll
   * (optimistic insert, post/undo responses, rollbacks). A poll GET that was
   * already in flight when that happened is a snapshot of the older world;
   * adopting it would erase the newer rows until the next poll. The
   * generation check discards those stale responses instead.
   */
  const generation = useRef(0);

  const adopt = useCallback((res: ReportsResponse) => {
    setReports(res.reports);
    setDrinkTotals(res.drinkTotals);
    setMe(res.me);
    meRef.current = res.me;
    setSkewMs(res.serverNow - Date.now());
    setFetchedAt(res.serverNow);
    // Only mutations carry this (the poll deliberately does not), and when
    // they do it is fresher than anything the timer would fetch.
    if (res.contributors) {
      contributorsRef.current = res.contributors;
      setContributors(res.contributors);
      contributorsAt.current = Date.now();
    }
  }, []);

  /**
   * The contributor counts, on their own slow cadence. Claims the timestamp
   * before awaiting so a slow (or failing) request cannot start a second one
   * on the next poll — including against a Worker too old to know the
   * endpoint, where every poll would otherwise spend a 404.
   */
  const refreshContributors = useCallback(async () => {
    const startedAt = generation.current;
    contributorsAt.current = Date.now();
    try {
      const res = await fetchContributors();
      if (startedAt !== generation.current) return; // a mutation brought newer counts
      contributorsRef.current = res;
      setContributors(res);
    } catch {
      /* no ranking, no card — the board above is unaffected */
    }
  }, []);

  const refresh = useCallback(async () => {
    // One place covers the first load, the tab coming back, and roughly every
    // tenth poll — whichever happens first after the interval has elapsed.
    if (Date.now() - contributorsAt.current >= CONFIG.contributorsRefreshMs) {
      void refreshContributors();
    }
    const startedAt = generation.current;
    try {
      const res = await fetchReports();
      if (startedAt !== generation.current) return; // a mutation won the race
      adopt(res);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '読み込みに失敗しました');
    }
  }, [adopt, refreshContributors]);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  // The clock and the poll are separate timers. The clock always runs:
  // 「N分前」, the 30-minute window, the afterglow and the opening-hours mask
  // all read `now`, and while the two were one timer, switching 自動更新 off
  // froze every one of them — a board left open on a wall said 「12分前」 all
  // afternoon and never noticed 17:00. 自動更新 decides only whether new data
  // is fetched.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), CONFIG.refreshIntervalMs);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!autoOn) return;
    const id = setInterval(() => void refresh(), CONFIG.refreshIntervalMs);
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

  /**
   * The thank-you a settled post earns — every tenth one by name.
   *
   * Reads the count from the mutation's own response, so the milestone is the
   * server's number rather than a tally the client keeps. Marking happens here
   * rather than inside the setToast updater because StrictMode invokes those
   * twice; the cost is that a thank-you swallowed by a concurrent error toast
   * counts as told, which is the same outcome as one nobody read.
   */
  const celebrationToast = useCallback((): Toast => {
    const thanks: Toast = { kind: 'thanks', text: '投稿ありがとうございます！' };
    const mine = contributorsRef.current?.mine;
    const me = meRef.current;
    if (!mine || !me) return thanks;

    const last = Math.max(readCelebrated(me), celebratedInSession.current);
    const milestone = nextCelebration(mine.postings, last);
    if (milestone === null) return thanks;

    celebratedInSession.current = milestone;
    markCelebrated(me, milestone);
    return {
      kind: 'celebrate',
      text: milestoneMessage(milestone, tierNewlyReached(milestone, last)),
    };
  }, []);

  /**
   * Opens the undo window — called only once the server has confirmed the
   * row. It used to start on the tap; on a slow round trip it then closed,
   * said thanks and invited feedback before anyone knew whether the post had
   * landed at all. The server accepts the delete for undoWindowMs + 15 s
   * after the row's own timestamp (worker/store.ts), so a window that opens
   * on confirmation still fits inside it unless the trip took over 15 s.
   */
  const openUndoWindow = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      undoTargetId.current = null;
      // The undo window closing without an undo is the moment the post is
      // truly settled — which makes it the honest moment to say thanks and
      // invite feedback. An undone post never reaches this line: undo()
      // clears this timer. Settled is also what post_done measures.
      track('post_done', secondsSinceLoad());
      const settled = celebrationToast();
      setToast((t) => (t?.kind === 'undo' ? settled : t));
      if (thanksTimer.current) clearTimeout(thanksTimer.current);
      thanksTimer.current = setTimeout(
        () => setToast((t) => (t?.kind === 'thanks' || t?.kind === 'celebrate' ? null : t)),
        // A milestone gets a couple of seconds longer: it says more, and it
        // is the one toast worth finishing.
        settled.kind === 'celebrate' ? 8_000 : 6_000,
      );
    }, CONFIG.undoWindowMs);
  }, [celebrationToast]);

  /**
   * Undo was tapped before the POST came back, so the row exists on the
   * server now: delete it, and land on the delete's snapshot rather than the
   * post's (adopting the post's first flashed the undone row back onto the
   * board for one render). If the delete fails the post stands — say so as an
   * undo failure, never as a posting failure, and let a refresh settle it.
   */
  const undoInFlight = useCallback(
    async (target: UndoTarget, posted: ReportsResponse) => {
      try {
        const deleted =
          target.kind === 'group' ? await deleteReportGroup(target.id) : await deleteReport(target.id);
        generation.current += 1;
        adopt(deleted);
      } catch (err) {
        adopt(posted);
        showError(err instanceof ApiError ? err.message : '取り消しに失敗しました');
        void refresh();
      }
    },
    [adopt, refresh, showError],
  );

  const post = useCallback(
    async (
      subject: SubjectKey,
      action: ReportValue,
      level: number | null = null,
    ): Promise<PostOutcome> => {
      if (posting) return 'skipped';
      setPosting(true);

      // A stale error toast's timer would otherwise fire mid-undo-window and
      // clear the undo toast this post is about to show.
      if (errorTimer.current) clearTimeout(errorTimer.current);

      // Declared out here so the rollback in catch can see it, minted inside
      // the try: crypto.randomUUID() throws outside a secure context, and a
      // throw before the try skipped finally and left `posting` stuck on.
      let optimisticId: string | null = null;
      try {
        generation.current += 1;
        optimisticId = `pending-${crypto.randomUUID()}`;
        const optimistic: Report = {
          id: optimisticId,
          subject,
          action,
          userId: me,
          userLabel: '利用者（あなた）',
          createdAt: Date.now() + skewMs,
          level,
        };
        setReports((prev) => [optimistic, ...prev]);

        // Undoable already, but not yet promised: the window opens below,
        // once the server has the row.
        setToast({ kind: 'sending', text: '送信しています…' });
        undoTargetId.current = null;
        undoRequested.current = false;
        if (undoTimer.current) clearTimeout(undoTimer.current);

        const res = await postReport(subject, action, level);
        generation.current += 1;
        setLoadError(null);

        if (undoRequested.current) {
          undoRequested.current = false;
          await undoInFlight({ kind: 'report', id: res.report.id }, res);
        } else {
          adopt(res);
          undoTargetId.current = { kind: 'report', id: res.report.id };
          setToast({ kind: 'undo', text: postedToast(subject, action, level) });
          openUndoWindow();
        }
        return 'ok';
      } catch (err) {
        generation.current += 1;
        setReports((prev) => prev.filter((r) => r.id !== optimisticId));
        if (undoTimer.current) clearTimeout(undoTimer.current);
        showError(err instanceof ApiError ? err.message : '投稿に失敗しました');
        return classifyPostError(err);
      } finally {
        setPosting(false);
      }
    },
    [adopt, me, openUndoWindow, posting, showError, skewMs, undoInFlight],
  );

  /**
   * A drink report. Same optimistic dance as post(), but one posting fans
   * out into several rows — the same expansion the server does, so the
   * meters move on the tap exactly the way they will settle.
   */
  const postDrink = useCallback(
    async (input: DrinkReportInput): Promise<PostOutcome> => {
      if (posting) return 'skipped';
      setPosting(true);
      if (errorTimer.current) clearTimeout(errorTimer.current);

      const optimisticIds: string[] = [];
      try {
        generation.current += 1;
        const stamp = Date.now() + skewMs;
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

        setToast({ kind: 'sending', text: '送信しています…' });
        undoTargetId.current = null;
        undoRequested.current = false;
        if (undoTimer.current) clearTimeout(undoTimer.current);

        const res = await postDrinkReport(input);
        generation.current += 1;
        setLoadError(null);

        if (undoRequested.current) {
          undoRequested.current = false;
          await undoInFlight({ kind: 'group', id: res.groupId }, res);
        } else {
          adopt(res);
          undoTargetId.current = { kind: 'group', id: res.groupId };
          setToast({ kind: 'undo', text: postedDrinkToast(input) });
          openUndoWindow();
        }
        return 'ok';
      } catch (err) {
        generation.current += 1;
        setReports((prev) => prev.filter((r) => !optimisticIds.includes(r.id)));
        if (undoTimer.current) clearTimeout(undoTimer.current);
        showError(err instanceof ApiError ? err.message : '投稿に失敗しました');
        return classifyPostError(err);
      } finally {
        setPosting(false);
      }
    },
    [adopt, me, openUndoWindow, posting, showError, skewMs, undoInFlight],
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

  /** Current time on the server's clock, refreshed whenever the board does. */
  const now = useMemo(() => Date.now() + skewMs, [skewMs, reports, tick]);

  return {
    reports,
    drinkTotals,
    contributors,
    me,
    now,
    loading,
    loadError,
    fetchedAt,
    posting,
    toast,
    autoOn,
    toggleAuto,
    post,
    postDrink,
    undo,
    refresh,
  };
}
