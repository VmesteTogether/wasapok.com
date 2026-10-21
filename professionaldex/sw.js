/* professionaldex service worker — installs the paper shell, then keeps PokéAPI +
   sprite responses in a runtime cache so places you've visited open offline. */
const SHELL = 'professionaldex-shell-v1';
const RUNTIME = 'professionaldex-rt-v1';
const ASSETS = ['./', 'index.html', 'app.js', 'manifest.webmanifest',
  'data/dex.json', 'data/typechart.js', 'data/natures.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.allSettled(ASSETS.map(a => c.add(a)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const runtime = /pokeapi\.co|raw\.githubusercontent\.com/.test(url.host);

  if (sameOrigin && !runtime) {
    // shell: cache-first, fall back to network, then index for navigations
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try { return await fetch(req); }
      catch { return (await caches.match('index.html')) || Response.error(); }
    })());
    return;
  }
  if (runtime) {
    // API + sprites: stale-while-revalidate
    e.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      const net = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});
