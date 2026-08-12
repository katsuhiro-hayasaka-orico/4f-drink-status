import { useCallback, useRef, useState } from 'react';
import type { Report } from '../../shared/domain.js';
import { advanceWatermark, buildNotificationBody } from '../lib/notifyLogic.js';

/**
 * Browser notifications for other people's posts.
 *
 * These ride the existing 30-second poll rather than a push channel, which
 * sets their honest limit: they fire while a tab is open (front or
 * background), and stop when the last tab closes. True closed-browser push
 * needs a service worker, a subscription table, and the Web Push encryption
 * stack — recorded as future work in the README, not smuggled in here.
 *
 * Notifications only fire while the tab is unattended (hidden or unfocused).
 * Someone looking at the board is already watching it update; telling them
 * again in the corner of their screen is noise.
 */

const STORAGE_KEY = 'drink-status-notify';
/**
 * One tag for report news, so a newer notification replaces a stale one
 * instead of stacking. Same-tag replacement is SILENT by default — no banner,
 * no sound, the notification just changes in the tray — so every news
 * notification also sets `renotify: true` to make the replacement announce
 * itself. Without that, one unread notification mutes every one after it.
 *
 * The enable-confirmation deliberately does NOT share this tag. It shipped
 * sharing it, and the result was exactly that trap: the confirmation sat in
 * the notification center, and every real report after it was swallowed as a
 * silent replacement — "notifications on, nothing ever arrives".
 */
const TAG = 'drink-status-reports';
const HELLO_TAG = 'drink-status-hello';
const TITLE = '4Fドリンク速報';
const ICON = '/apple-touch-icon.png';

/**
 * `denied` is the browser's block, distinct from our own `off` — the button
 * can undo one and only point helplessly at the other. `unsupported` hides
 * the button entirely (iOS Safari outside an installed PWA, and Android
 * Chrome once the constructor has proven itself unusable).
 */
export type NotifyState = 'unsupported' | 'denied' | 'off' | 'on';

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function readInitialState(): NotifyState {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    // The stored wish only holds while the browser still agrees: a permission
    // revoked in settings must win over what we remembered.
    if (localStorage.getItem(STORAGE_KEY) === 'on' && Notification.permission === 'granted') {
      return 'on';
    }
  } catch {
    /* storage unavailable — treat as off */
  }
  return 'off';
}

function save(value: 'on' | 'off') {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* the choice just won't survive a reload */
  }
}

/** Nobody is looking: tab hidden, or window not focused. */
function pageIsUnattended(): boolean {
  return document.visibilityState === 'hidden' || !document.hasFocus();
}

/**
 * Returns whether the notification could actually be shown. Android Chrome
 * passes every capability check — the constructor exists, the permission
 * dance succeeds — and then throws from `new Notification()` itself, because
 * only service workers may post there. An uncaught throw here would surface
 * inside a React effect and unmount the whole tree, so the constructor is
 * the one place this feature touches that must never leak.
 */
function show(body: string, tag: string, renotify: boolean): boolean {
  try {
    // `renotify` is missing from some lib.dom versions but understood by
    // Chromium; browsers that don't know it (Safari) simply ignore it.
    const options: NotificationOptions & { renotify?: boolean } = {
      body,
      tag,
      icon: ICON,
      lang: 'ja',
    };
    if (renotify) options.renotify = true;
    const n = new Notification(TITLE, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function useNotifications() {
  const [state, setState] = useState<NotifyState>(readInitialState);
  const watermark = useRef<number | null>(null);
  /** Guards toggle() against re-entry while the permission prompt is open. */
  const busy = useRef(false);

  // observe() runs from an effect while toggle() runs from a click; the ref
  // spares observe from being rebuilt (and re-subscribed) on every toggle.
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Feed every fresh copy of the report list through here. The watermark
   * advances unconditionally — even while notifications are off — so turning
   * them on later never dumps a backlog.
   */
  const observe = useCallback((reports: readonly Report[], me: string) => {
    // Until the first fetch resolves, `me` is unknown and everything would
    // look foreign. Real data always arrives with `me` set.
    if (me === '') return;

    const baselining = watermark.current === null;
    const { watermark: next, fresh } = advanceWatermark(reports, me, watermark.current);
    watermark.current = next;

    if (baselining || fresh.length === 0) return;
    if (stateRef.current !== 'on') return;
    if (!supported() || Notification.permission !== 'granted') return;
    if (!pageIsUnattended()) return;

    if (!show(buildNotificationBody(fresh), TAG, true)) {
      // The constructor is unusable on this browser. Stop pretending, so the
      // button stops promising something that cannot be delivered.
      setState('unsupported');
      save('off');
    }
  }, []);

  /** Returns whether notifications ended up on, so the caller can react. */
  const toggle = useCallback(async (): Promise<boolean> => {
    if (!supported() || busy.current) return false;

    if (stateRef.current === 'on') {
      setState('off');
      save('off');
      return false;
    }

    busy.current = true;
    try {
      // Re-read rather than trusting state: the user may have unblocked (or
      // blocked) the site in browser settings since the page loaded.
      let permission: string = Notification.permission;
      if (permission === 'default') {
        // Must happen inside the click handler's call stack — browsers ignore
        // permission requests that aren't user-initiated. Old Safari only has
        // the callback form, whose no-argument call resolves to undefined;
        // falling back to re-reading .permission keeps it from misreading
        // "no answer yet" as an answer.
        const result = await Promise.resolve(Notification.requestPermission()).catch(
          () => undefined,
        );
        permission = typeof result === 'string' ? result : Notification.permission;
      }

      if (permission === 'denied') {
        // The browser has this site blocked; only its own settings can undo it.
        setState('denied');
        save('off');
        return false;
      }
      if (permission !== 'granted') {
        // Prompt dismissed without an answer ('default'). Not a block — the
        // next click will simply ask again, so the UI must not claim one.
        setState('off');
        save('off');
        return false;
      }

      // Prove the constructor works before claiming to be on: the demo
      // doubles as the capability check Android Chrome fails.
      if (!show('通知をONにしました。新しい投稿があると、このタブを開いている間お知らせします', HELLO_TAG, false)) {
        setState('unsupported');
        save('off');
        return false;
      }

      setState('on');
      save('on');
      return true;
    } finally {
      busy.current = false;
    }
  }, []);

  return { state, toggle, observe };
}
