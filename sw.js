/* ==========================================================
   Service worker — شجرۂ طیبہ ساداتِ ہاشمیہ چشتیہ

   Two strategies, chosen by what the request is for:

     • The page itself  → network first, cache as fallback.
       The whole app (markup, data, script) lives in one HTML file,
       so a cache-first page would pin people to an old dataset.
       Online they always get the current file; offline they get the
       last one they loaded.

     • Everything else  → cache first, refreshed in the background.
       Fonts, Tailwind, Font Awesome and D3 are versioned CDN URLs
       that never change under the same address, so serving them from
       the cache immediately is both correct and much faster.
   ========================================================== */

const VERSION    = 'v1';
const SHELL      = `shajra-shell-${VERSION}`;
const RUNTIME    = `shajra-runtime-${VERSION}`;
const KEEP       = [SHELL, RUNTIME];

/* Resolved against the worker's own location, so the app still works
   from a project subpath such as /hashmiya/ on GitHub Pages. */
const SHELL_URLS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png'
];

const CDN_HOSTS = [
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL);
        // addAll rejects the whole install if any single URL fails, so add
        // them individually and let the rest through.
        await Promise.all(SHELL_URLS.map(url =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        ));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.map(n => KEEP.includes(n) ? null : caches.delete(n)));
        if (self.registration.navigationPreload) {
            await self.registration.navigationPreload.enable();
        }
        await self.clients.claim();
    })());
});

self.addEventListener('message', event => {
    if (event.data === 'skip-waiting') self.skipWaiting();
});

async function networkFirst(event) {
    const cache = await caches.open(SHELL);
    try {
        const preloaded = await event.preloadResponse;
        const response = preloaded || await fetch(event.request);
        if (response && response.ok) cache.put('./index.html', response.clone());
        return response;
    } catch (err) {
        return (await cache.match('./index.html'))
            || (await cache.match('./'))
            || new Response('<h1>آف لائن</h1>', {
                status: 503,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(RUNTIME);
    const hit = await cache.match(request);
    const fetching = fetch(request).then(response => {
        // Opaque responses (no-cors CDN fonts) report status 0 but are usable.
        if (response && (response.ok || response.type === 'opaque')) {
            cache.put(request, response.clone()).catch(() => {});
        }
        return response;
    }).catch(() => null);

    return hit || (await fetching) || Response.error();
}

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(event));
        return;
    }

    const sameOrigin = url.origin === self.location.origin;
    if (sameOrigin || CDN_HOSTS.includes(url.hostname)) {
        event.respondWith(cacheFirst(request));
    }
});
