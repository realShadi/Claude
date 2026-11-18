// Sadran service worker: shows availability reminders that arrive while the site is closed,
// and opens the right screen when one is tapped. It caches nothing, so the site is always current.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'סדרן', {
    body: data.body || '',
    dir: 'rtl',
    lang: 'he',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'sadran',
    data: { url: data.url || './' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if (client.url.startsWith(self.registration.scope)) {
        return client.focus().then(c => (c && c.navigate ? c.navigate(url) : c)).catch(() => self.clients.openWindow(url));
      }
    }
    return self.clients.openWindow(url);
  }));
});
