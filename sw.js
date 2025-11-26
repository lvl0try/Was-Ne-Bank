// Service Worker for offline functionality
// CRITICAL: Use relative paths for GitHub Pages subdirectory deployment
const CACHE_NAME = 'bench-finder-v2';
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://r2cdn.perplexity.ai/fonts/FKGroteskNeue.woff2'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('✅ Cache opened:', CACHE_NAME);
                console.log('📦 Caching URLs:', urlsToCache);
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('✅ All resources cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ Cache addAll failed:', error);
                console.error('Failed URLs might include:', urlsToCache);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('🔧 Service Worker activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Service Worker activated');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }

                // Clone the request
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest).then((response) => {
                    // Check if valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response
                    const responseToCache = response.clone();

                    // Cache OpenStreetMap tiles, Esri satellite tiles, and other resources
                    if (event.request.url.includes('tile.openstreetmap.org') || 
                        event.request.url.includes('arcgisonline.com') ||
                        event.request.url.includes('unpkg.com') ||
                        event.request.url.includes('unsplash.com')) {
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                    }

                    return response;
                }).catch(() => {
                    // Network request failed, try to return a cached fallback
                    console.log('⚠️ Network request failed, serving from cache fallback');
                    return caches.match('./index.html').then(cachedResponse => {
                        return cachedResponse || caches.match('./');
                    });
                });
            })
    );
});