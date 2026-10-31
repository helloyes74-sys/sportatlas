// Service Worker: eigene Dateien immer zuerst frisch vom Server (Fallback Cache, damit die App offline öffnet);
// Bibliotheken und Schriften aus dem Cache; Kacheln, Gelände und Wetter nur online.
const VERSION = "sportatlas-v7";
const SHELL = ["./", "index.html", "css/app.css", "js/main.js", "js/map.js", "js/ui.js", "js/data.js", "js/profile.js", "js/weather.js", "js/geo.js", "js/sectors.js", "js/favorites.js", "js/filters.js", "js/gpx.js", "js/spots.js", "datenschutz.html", "vendor/fonts/fonts.css", "vendor/maplibre/maplibre-gl.js", "vendor/maplibre/maplibre-gl.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const own = url.origin === location.origin;
  const cdn = /unpkg\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (own) {
    e.respondWith(fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  if (cdn) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })));
  }
});
