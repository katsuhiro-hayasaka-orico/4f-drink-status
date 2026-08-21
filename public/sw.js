/*
 * 4Fドリンク速報 service worker — push display only.
 *
 * No fetch handler and no caching on purpose: the app already handles being
 * online-only, and a cache layer is a whole second source of staleness bugs.
 * This file exists so the browser has somewhere to deliver pushes after the
 * last tab closes — including installed PWAs on iOS 16.4+.
 *
 * iOS suspends push permission for apps that receive pushes without showing
 * a notification, so every push shows one, even if the payload is broken.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* 壊れたペイロードでも既定文で通知は出す */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '4Fドリンク速報', {
      body: data.body || '新しい投稿があります',
      // Same tag + renotify: a newer report replaces a stale unread one in
      // the tray but still announces itself (see the old in-tab notifier's
      // hard-won lesson about silent same-tag replacement).
      tag: data.tag || 'drink-status-reports',
      renotify: true,
      icon: '/apple-touch-icon.png',
      badge: '/favicon-32.png',
      lang: 'ja',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) return client.focus();
        }
        return self.clients.openWindow('/');
      }),
  );
});
