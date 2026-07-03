const CACHE_NAME = 'gpt-image-2-for-tjh-v0.6.10-background-manifest-20260703'
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './brand/gpt-img-2-for-tjh-icon.png']

function isCacheableResponse(url, response) {
    if (!response.ok) return false

    const contentType = response.headers.get('content-type') || ''
    const path = url.pathname.toLowerCase()

    if (path.endsWith('.css')) return contentType.includes('text/css')
    if (path.endsWith('.js') || path.endsWith('.mjs')) return contentType.includes('javascript')
    return !contentType.includes('text/html')
}

function isBuildAsset(url) {
    return url.pathname.includes('/assets/')
}

function shouldBypassRuntimeCache(request, url) {
    return request.cache === 'no-store' || url.pathname === '/wallpapers/background-wallpapers.json'
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
    )
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
        ),
    )
    self.clients.claim()
})

self.addEventListener('fetch', (event) => {
    const { request } = event

    if (request.method !== 'GET') return

    const url = new URL(request.url)
    if (url.origin !== self.location.origin) return
    if (url.pathname.endsWith('/sw.js')) return

    if (shouldBypassRuntimeCache(request, url)) {
        event.respondWith(fetch(request).catch(() => caches.match(request)))
        return
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone()
                    caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy))
                    return response
                })
                .catch(() => caches.match('./index.html')),
        )
        return
    }

    if (isBuildAsset(url)) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (isCacheableResponse(url, response)) {
                        const copy = response.clone()
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
                    }
                    return response
                })
                .catch(() => caches.match(request)),
        )
        return
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached

            return fetch(request).then((response) => {
                if (isCacheableResponse(url, response)) {
                    const copy = response.clone()
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
                }
                return response
            })
        }),
    )
})
