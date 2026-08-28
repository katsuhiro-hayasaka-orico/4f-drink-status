/**
 * Add-to-Home-Screen hint logic, pure so vitest can pin the branches. The
 * browser half (reading the UA, display-mode, localStorage) lives in the
 * A2hsBanner component.
 */

export type A2hsPlatform = 'ios' | 'android';

const STORAGE_KEY = 'drink-status-a2hs-dismissed';

/**
 * Which install hint this visitor should see, or null for none.
 *
 * - Installed (standalone) → they already did it.
 * - Dismissed → they said no once; a hint that keeps coming back is a nag.
 * - iPadOS 13+ masquerades as macOS but keeps a touchscreen, so the iPad
 *   check also accepts "Macintosh + touch".
 * - Desktop browsers get nothing — the MobileInvite banner covers PC.
 */
export function a2hsHint(
  ua: string,
  standalone: boolean,
  dismissed: boolean,
  maxTouchPoints = 0,
): A2hsPlatform | null {
  if (standalone || dismissed) return null;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return null;
}

export function readA2hsDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // No storage means the hint would reappear every load — treat as
    // dismissed rather than nag.
    return true;
  }
}

export function saveA2hsDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* the dismissal just won't survive a reload */
  }
}
