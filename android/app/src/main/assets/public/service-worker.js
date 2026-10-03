const CACHE_NAME = "asmr3d-v0.1-mobile";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./mobile-materials.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./samples/0171335_music_box_horizontal.ogg",
  "./samples/0169373_music_box_vertical.ogg",
  "./samples/0169329_matchbox_dropped.ogg",
  "./samples/0565204_keyboard_mono.ogg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
