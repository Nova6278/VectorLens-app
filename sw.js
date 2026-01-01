const CACHE_NAME = 'vectorlens-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/index.tsx',
  '/metadata.json',
  '/logo.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});