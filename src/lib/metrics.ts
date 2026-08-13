import type { EventName } from '../../shared/domain.js';

/**
 * Fire-and-forget usage measurement. A metric must never cost the user
 * anything: no await, no error toast, no retry. Every event here fires
 * mid-session (a tap, a scroll, a settled post), so nothing needs to
 * outlive the page — a plain fetch is enough, and it keeps local dev
 * (miniflare) away from the half-open sockets keepalive leaves behind.
 */
export function track(name: EventName, value?: number): void {
  try {
    fetch('/api/events', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value === undefined ? { name } : { name, value }),
    }).catch(() => {
      /* metrics are best-effort by definition */
    });
  } catch {
    /* even a synchronous fetch failure must stay silent */
  }
}

/** Whole seconds since this page was opened — the post_done value. */
const loadedAt = Date.now();
export function secondsSinceLoad(): number {
  return Math.round((Date.now() - loadedAt) / 1000);
}
