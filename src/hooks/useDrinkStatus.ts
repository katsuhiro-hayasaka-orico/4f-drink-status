import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from '../../shared/config.js';
import {
  ACTION_META,
  SUBJECT_LABELS,
  type ActionKey,
  type Report,
  type SubjectKey,
} from '../../shared/domain.js';
import { ApiError, deleteReport, fetchReports, postReport } from '../lib/api.js';

export interface Toast {
  kind: 'undo' | 'error';
  text: string;
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

  /** Server id of the report the toast can take back, once it is known. */
  const undoTargetId = useRef<string | null>(null);
  /** Set when undo is tapped before the POST has come back. */
  const undoRequested = useRef(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adopt = useCallback((res: { reports: Report[]; me: string; serverNow: number }) => {
    setReports(res.reports);
    setMe(res.me);
    setSkewMs(res.serverNow - Date.now());
  }, []);

  const refresh = useCallback(async () => {
    try {
      adopt(await fetchReports());
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

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
    },
    [],
  );

  const showError = useCallback((text: string) => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setToast({ kind: 'error', text });
    errorTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const post = useCallback(
    async (subject: SubjectKey, action: ActionKey) => {
      if (posting) return;
      setPosting(true);

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

      const levelNote =
        subject === 'machine' ? '' : `（推定残量 ${ACTION_META[action].level}%）`;
      setToast({
        kind: 'undo',
        text: `${SUBJECT_LABELS[subject]}を「${ACTION_META[action].label}」で投稿しました。みんなの観測を再集計しました${levelNote}`,
      });

      undoTargetId.current = null;
      undoRequested.current = false;
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => {
        undoTargetId.current = null;
        setToast((t) => (t?.kind === 'undo' ? null : t));
      }, CONFIG.undoWindowMs);

      try {
        const res = await postReport(subject, action);
        adopt(res);
        setLoadError(null);

        if (undoRequested.current) {
          // Undo was tapped while the post was still in flight.
          undoRequested.current = false;
          adopt(await deleteReport(res.report.id));
        } else {
          undoTargetId.current = res.report.id;
        }
      } catch (err) {
        setReports((prev) => prev.filter((r) => r.id !== optimisticId));
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

    const id = undoTargetId.current;
    if (!id) {
      // The post hasn't landed yet — drop the optimistic row now and delete
      // the real one the moment it exists.
      undoRequested.current = true;
      setReports((prev) => prev.filter((r) => !r.id.startsWith('pending-')));
      return;
    }

    undoTargetId.current = null;
    try {
      adopt(await deleteReport(id));
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
    me,
    now,
    loading,
    loadError,
    posting,
    toast,
    autoOn,
    toggleAuto,
    post,
    undo,
    refresh,
  };
}
