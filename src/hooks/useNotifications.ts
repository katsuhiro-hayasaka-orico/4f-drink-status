import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPushKey, registerPushSubscription, unregisterPushSubscription } from '../lib/api.js';

/**
 * Web Push notifications for other people's posts.
 *
 * The old notifier rode the 30-second poll and honestly said so: news only
 * while a tab was open. This one subscribes the browser itself — the server
 * pushes through the platform's service (APNs/FCM/Mozilla), so notifications
 * arrive with every tab closed, including installed PWAs on iOS 16.4+.
 *
 * The subscription IS the state. Nothing is kept in localStorage: whether
 * `pushManager.getSubscription()` returns one — and whether the permission
 * still stands — decides on/off, so a permission revoked in browser settings
 * can never disagree with what the button claims.
 *
 * On iOS Safari in a plain tab, `PushManager` simply doesn't exist (Apple
 * exposes push to Home-Screen web apps only), so the button hides itself and
 * the AboutDialog explains the 「ホーム画面に追加」 route instead.
 */

const HELLO_TAG = 'drink-status-hello';
const TITLE = '4Fドリンク速報';

/**
 * `denied` is the browser's block, distinct from our own `off` — the button
 * can undo one and only point helplessly at the other. `unsupported` hides
 * the button entirely (no service worker / no PushManager / the server has
 * no VAPID key configured).
 */
export type NotifyState = 'unsupported' | 'denied' | 'off' | 'on';

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** applicationServerKey wants raw bytes; the server hands out base64url. */
function keyBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The three strings the server stores, or null if the browser held them back. */
function serialize(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } | null {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

export function useNotifications() {
  const [state, setState] = useState<NotifyState>(() => (supported() ? 'off' : 'unsupported'));
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const serverKey = useRef<string | null>(null);
  /** Guards toggle() against re-entry while the permission prompt is open. */
  const busy = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Register the service worker and reconcile the button with reality:
  // existing subscription + standing permission = on. The re-register on an
  // existing subscription is self-healing for a wiped or migrated D1 — one
  // idempotent upsert per load keeps the server's copy alive.
  useEffect(() => {
    if (!supported()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [reg, { key }] = await Promise.all([
          navigator.serviceWorker.register('/sw.js'),
          fetchPushKey(),
        ]);
        if (cancelled) return;
        registration.current = reg;
        serverKey.current = key;
        if (!key) {
          setState('unsupported');
          return;
        }
        if (Notification.permission === 'denied') {
          setState('denied');
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        const stored = sub && Notification.permission === 'granted' ? serialize(sub) : null;
        if (stored) {
          registerPushSubscription(stored).catch(() => {
            /* the next successful load repairs it */
          });
          setState('on');
        } else {
          setState('off');
        }
      } catch {
        if (!cancelled) setState('unsupported');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Returns whether notifications ended up on, so the caller can react. */
  const toggle = useCallback(async (): Promise<boolean> => {
    const reg = registration.current;
    if (!supported() || !reg || busy.current) return false;
    busy.current = true;
    try {
      if (stateRef.current === 'on') {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe().catch(() => false);
          await unregisterPushSubscription(endpoint).catch(() => {
            /* the next failed push marks it gone server-side anyway */
          });
        }
        setState('off');
        return false;
      }

      // Must happen inside the click handler's call stack — browsers ignore
      // permission requests that aren't user-initiated.
      const permission = await Promise.resolve(Notification.requestPermission()).catch(
        () => Notification.permission,
      );
      if (permission === 'denied') {
        setState('denied');
        return false;
      }
      if (permission !== 'granted') {
        // Prompt dismissed without an answer. Not a block — the next click
        // will simply ask again, so the UI must not claim one.
        setState('off');
        return false;
      }

      const key = serverKey.current ?? (await fetchPushKey()).key;
      serverKey.current = key;
      if (!key) {
        setState('unsupported');
        return false;
      }

      let sub: PushSubscription;
      try {
        sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes(key) as BufferSource,
          }));
      } catch {
        // The platform refused a subscription (private mode, enterprise
        // policy, no push service reachable). Permission stands, so leave
        // the button at off and let another click retry.
        setState('off');
        return false;
      }

      const stored = serialize(sub);
      if (!stored) {
        await sub.unsubscribe().catch(() => false);
        setState('off');
        return false;
      }
      try {
        await registerPushSubscription(stored);
      } catch {
        // The server never learned about it — an orphan subscription would
        // be "on" that never notifies, so roll the browser side back too.
        await sub.unsubscribe().catch(() => false);
        setState('off');
        return false;
      }

      // The confirmation doubles as proof the display path works, via the
      // service worker so Android Chrome (no Notification constructor for
      // pages) shows it too. Failure is not worth rolling back a working
      // subscription.
      reg
        .showNotification(TITLE, {
          body: '通知をONにしました。新しい投稿があると、タブを閉じていてもお知らせします',
          tag: HELLO_TAG,
          icon: '/apple-touch-icon.png',
          lang: 'ja',
        })
        .catch(() => {});

      setState('on');
      return true;
    } finally {
      busy.current = false;
    }
  }, []);

  return { state, toggle };
}
