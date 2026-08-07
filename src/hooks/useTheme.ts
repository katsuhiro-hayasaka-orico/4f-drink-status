import { useCallback, useEffect, useState } from 'react';

/**
 * 'system' follows the OS and is the default; the other two override it.
 * The choice is remembered, the resolved value is not — so a device that
 * switches to dark at sunset takes the board with it.
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'drink-status-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    /* private mode, disabled storage — fall through to the OS setting */
  }
  return 'system';
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * The header's theme control.
 *
 * The attribute this writes is the same one the inline script in index.html
 * sets before the first paint, so there is exactly one switch: everything else
 * reads `:root[data-theme='dark']`.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  // Track the OS setting even while overridden, so switching back to 'system'
  // lands on the right theme immediately.
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = preference === 'system' ? system : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const choose = useCallback((next: ThemePreference) => {
    setPreference(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice just won't survive a reload */
    }
  }, []);

  return { preference, resolved, choose };
}
