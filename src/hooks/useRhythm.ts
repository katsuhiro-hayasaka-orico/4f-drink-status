import { useEffect, useState } from 'react';
import { buildRhythm, type Rhythm } from '../../shared/rhythm.js';
import { fetchRhythm } from '../lib/api.js';

/**
 * Four weeks of rhythm, fetched once per page load. The card describes slow
 * habits, not the live machine — riding the 30-second poll would spend
 * requests re-learning what only changes week by week. `fetchedAt` feeds the
 * 「更新 M/D HH:MM」 stamp; a fetch failure simply keeps the card hidden.
 */
export function useRhythm(): { rhythm: Rhythm | null; fetchedAt: number | null } {
  const [state, setState] = useState<{ rhythm: Rhythm; fetchedAt: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRhythm()
      .then((res) => {
        if (cancelled) return;
        setState({ rhythm: buildRhythm(res.cells), fetchedAt: res.serverNow });
      })
      .catch(() => {
        /* no rhythm, no card — the board above carries the live picture */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { rhythm: state?.rhythm ?? null, fetchedAt: state?.fetchedAt ?? null };
}
