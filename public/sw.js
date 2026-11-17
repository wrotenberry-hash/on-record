// Service worker: shows alerts (fetched from the site; pushes carry no content) and opens their page.
// This file is static and cannot read the product name (lib/brand.ts): the title and the icon come from
// /api/push/latest, which always sends them. The words and the plain icon below are only shown if that request
// fails, so they name no product.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let a = { title: "New alert", body: "Something you follow moved.", url: "/", icon: "/icon-mark-192.png" };
    try { const r = await fetch("/api/push/latest", { credentials: "same-origin", cache: "no-store" }); if (r.ok) a = await r.json(); } catch { /* show the generic note */ }
    await self.registration.showNotification(a.title || "New alert", { body: a.body, data: { url: a.url }, icon: a.icon || "/icon-mark-192.png", badge: a.icon || "/icon-mark-192.png" });
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
