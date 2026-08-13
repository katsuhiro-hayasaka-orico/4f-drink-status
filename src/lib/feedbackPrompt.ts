import { FEEDBACK_PROMPT_COOLDOWN_MS } from '../../shared/config.js';

/**
 * The 7-day throttle on the *unprompted* feedback dialog. The thank-you toast
 * keeps its small link every time; only the dialog that opens itself is
 * rationed, keyed off the last time this device submitted feedback or
 * explicitly closed the form.
 *
 * Same localStorage conventions as the theme and notification keys: a bare
 * string value, every access wrapped in try/catch for private mode, and the
 * stored value validated on read rather than trusted.
 */
const STORAGE_KEY = 'drink-status-feedback-prompted';

export function shouldAutoPrompt(now: number): boolean {
  try {
    const at = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(at) && at > 0 && now - at < FEEDBACK_PROMPT_COOLDOWN_MS) return false;
  } catch {
    /* unreadable storage reads as "never prompted" */
  }
  return true;
}

export function markPrompted(now: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    /* worst case the dialog auto-opens again next visit */
  }
}
