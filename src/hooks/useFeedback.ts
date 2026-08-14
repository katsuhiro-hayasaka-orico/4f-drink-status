import { useCallback, useEffect, useRef, useState } from 'react';
import type { MoodKey } from '../../shared/domain.js';
import { fetchFeedback, postFeedback } from '../lib/api.js';

const EMPTY_TALLY: Record<MoodKey, number> = { happy: 0, neutral: 0, sad: 0 };

/**
 * ご意見箱 — submit an opinion, see only the mood tally.
 *
 * Comment bodies are collected but never displayed: the site is public and
 * free text is where personal or confidential details end up, so bodies go
 * admin-only (read via wrangler, never over the API). The tally is the one
 * public trace, so contributors can see their voice was counted.
 */
export function useFeedback() {
  const [tally, setTally] = useState<Record<MoodKey, number>>(EMPTY_TALLY);
  const generation = useRef(0);

  useEffect(() => {
    const startedAt = generation.current;
    fetchFeedback()
      .then((res) => {
        if (startedAt === generation.current) setTally(res.tally);
      })
      .catch(() => {
        /* The board works without the tally; stay at zero quietly. */
      });
  }, []);

  /** Throws ApiError on failure — the dialog shows the message in place. */
  const submit = useCallback(async (mood: MoodKey, body: string) => {
    const res = await postFeedback(mood, body);
    generation.current += 1;
    setTally(res.tally);
  }, []);

  return { tally, submit };
}
