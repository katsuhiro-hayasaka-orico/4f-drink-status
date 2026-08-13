import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedbackEntry, FeedbackResponse, MoodKey } from '../../shared/domain.js';
import { fetchFeedback, postFeedback, toggleFeedbackLike } from '../lib/api.js';

/**
 * みんなの声 — the feedback list, one submit, and like toggling.
 *
 * Feedback has no realtime pressure, so unlike the reports it does not ride
 * the 30-second poll: one fetch on mount, then every mutation response
 * carries the refreshed list (the same no-second-round-trip pattern the
 * reports API uses).
 */
export function useFeedback() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);

  // Same stale-response guard as useDrinkStatus: a like toggled while another
  // response is in flight must not be erased by the older snapshot.
  const generation = useRef(0);

  const adopt = useCallback((res: FeedbackResponse) => {
    setEntries(res.feedback);
  }, []);

  useEffect(() => {
    const startedAt = generation.current;
    fetchFeedback()
      .then((res) => {
        if (startedAt === generation.current) adopt(res);
      })
      .catch(() => {
        /* The board works without the voices section; stay empty quietly. */
      });
  }, [adopt]);

  /** Throws ApiError on failure — the dialog shows the message in place. */
  const submit = useCallback(
    async (mood: MoodKey, body: string) => {
      const res = await postFeedback(mood, body);
      generation.current += 1;
      adopt(res);
    },
    [adopt],
  );

  const toggleLike = useCallback(
    async (id: string) => {
      // Optimistic flip so the heart responds on the tap; the server snapshot
      // replaces it, and an error rolls the flip back.
      generation.current += 1;
      const flip = (list: FeedbackEntry[]) =>
        list.map((e) =>
          e.id === id
            ? { ...e, likedByMe: !e.likedByMe, likes: e.likes + (e.likedByMe ? -1 : 1) }
            : e,
        );
      setEntries(flip);
      try {
        const res = await toggleFeedbackLike(id);
        generation.current += 1;
        adopt(res);
      } catch {
        generation.current += 1;
        setEntries(flip);
      }
    },
    [adopt],
  );

  return { entries, submit, toggleLike };
}
