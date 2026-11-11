self.addEventListener('push', (event) => {
  // Every push must show a notification: browsers can revoke access otherwise.
  const { title = '📚 Your phrases for today', body = '' } = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      // Android's status bar icon: white on transparent, since Android uses only its shape.
      badge: '/badge-96.png',
      tag: 'daily-phrases',
    }),
  );
});

// Nothing is cached, so a new version can take over at once instead of waiting
// for every window of the app to close, which an installed app may never do.
self.addEventListener('install', () => self.skipWaiting());

// Every notification is the daily reminder, whose phrases the app shows under Today.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const [existing] = windows;
      // A new window opens on Today, its first section. An open one comes back as it
      // was, so it's asked to go to Today and load the phrases just sent (see PhraseApp).
      if (!existing) return self.clients.openWindow('/');
      existing.postMessage({ type: 'show-today' });
      return existing.focus();
    }),
  );
});
