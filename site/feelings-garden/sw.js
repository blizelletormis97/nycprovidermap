// Feelings Garden moved to https://blizelletormis97.github.io/feelings-garden/.
// This replaces the old offline worker: it clears its saved copy and removes itself, so old installs load the move notice.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
  })());
});
