// On Record service worker: shows alerts (fetched from the site; pushes carry no content) and opens their page.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let a = { title: "On Record", body: "Something you follow moved.", url: "/" };
    try { const r = await fetch("/api/push/latest", { credentials: "same-origin", cache: "no-store" }); if (r.ok) a = await r.json(); } catch { /* show the generic note */ }
    await self.registration.showNotification(a.title, { body: a.body, data: { url: a.url }, icon: "/icon-192.png", badge: "/icon-192.png" });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) if (w.url === url && "focus" in w) return w.focus();
    return self.clients.openWindow(url);
  })());
});
