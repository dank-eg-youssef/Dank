const ERA_SW_VERSION = '2.0.0';
const ERA_CACHE_PREFIX = 'era-v' + ERA_SW_VERSION;

async function purgeOutdatedCaches() {
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(
    keys.map((key) => {
      if (!key.startsWith(ERA_CACHE_PREFIX) || /dank/i.test(key)) {
        return caches.delete(key);
      }
      return Promise.resolve(false);
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await purgeOutdatedCaches();
      await self.clients.claim();
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        client.postMessage({
          type: 'ERA_SW_ACTIVATED',
          version: ERA_SW_VERSION,
        });
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'CLEAR_ALL_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'ERA', body: event.data.text() };
  }
  const title = payload.title || 'ERA';
  const options = {
    body: payload.body || '',
    icon: '/icon.svg?v=' + ERA_SW_VERSION,
    badge: '/icon.svg?v=' + ERA_SW_VERSION,
    data: { chatId: payload.chatId || '' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const chatId = event.notification.data && event.notification.data.chatId;
  const targetUrl = chatId ? '/?chat=' + encodeURIComponent(chatId) : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'ERA_OPEN_CHAT', chatId });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
