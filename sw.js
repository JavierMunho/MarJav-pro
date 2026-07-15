// Service Worker de marJav Pro
// v2: el HTML principal se pide siempre a internet primero (para que los
// arreglos lleguen al toque), y solo se usa la copia guardada si no hay señal.
// Los DATOS (productos, clientes, ventas, etc.) NO se cachean acá: viven en Firestore.

const CACHE_NAME = 'marjavpro-v2';
const ARCHIVOS_CACHE = [
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

    let esPaginaPrincipal = event.request.mode === 'navigate' ||
        event.request.url.endsWith('index.html') ||
        event.request.url.endsWith('/');

    if (esPaginaPrincipal) {
        // RED PRIMERO: así los arreglos nuevos llegan enseguida.
        // Si no hay internet, recién ahí se usa la última copia guardada.
        event.respondWith(
            fetch(event.request).then((respuestaRed) => {
                const clone = respuestaRed.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return respuestaRed;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // Para íconos/manifest (que casi no cambian): caché primero, más rápido.
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
