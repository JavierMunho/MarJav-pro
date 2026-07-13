// Service Worker de marJav Pro
// Cachea el "cascarón" de la app para que abra rápido y funcione offline.
// Los DATOS (productos, clientes, ventas, etc.) NO se cachean acá: viven en Firestore.

const CACHE_NAME = 'marjavpro-v1';
const ARCHIVOS_CACHE = [
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((nombres) =>
            Promise.all(
                nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // No interceptar llamadas a Firebase/Firestore ni a APIs externas: siempre van a la red.
    if (event.request.url.includes('firestore.googleapis.com') ||
        event.request.url.includes('firebaseio.com') ||
        event.request.url.includes('googleapis.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fetchPromise = fetch(event.request).then((respuestaRed) => {
                if (respuestaRed && respuestaRed.status === 200 && event.request.method === 'GET') {
                    const clone = respuestaRed.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return respuestaRed;
            }).catch(() => cached);
            return cached || fetchPromise;
        })
    );
});
