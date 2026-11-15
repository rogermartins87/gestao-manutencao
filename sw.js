// =====================================================================
// Service worker: só recebe os avisos no celular (não guarda o site em cache).
// =====================================================================
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: 'Nova parada', texto: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Nova parada', {
    body: d.texto || '',
    icon: 'img/icone-192.png',
    badge: 'img/icone-192.png',
    tag: d.tag || undefined,
    renotify: true,
    requireInteraction: true,   // fica na tela (e na tela bloqueada) até alguém tocar
    silent: false,
    vibrate: [200, 100, 200],
    data: { link: d.link || '' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const alvo = new URL('./' + (e.notification.data?.link || ''), self.registration.scope).href;
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abertas) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); return c.navigate(alvo).catch(() => {}); }
    }
    return self.clients.openWindow(alvo);
  })());
});
