// 安乐窝的离线缓存：来过一次之后，没有网也进得来。
//   页面本身：先走网络（拿到新的就换掉旧的），断网时用上次的；
//   其余同源的静态文件（带指纹的脚本样式、用到的字体分片、图标）：有缓存就用缓存。
// 换了不带指纹的文件（public/ 下的图标等）之后，把下面的版本号加一。
// （名字一换，旧的「空山」那一份缓存在启用时就清掉了。）
const V = 'anlewo-v1';
// 页面本身存在这个名字下：缓存管的那个目录（放在子目录下时不是 '/'）
const HOME = self.registration.scope;
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'warm' || !Array.isArray(e.data.urls)) return;
  e.waitUntil(caches.open(V).then(async (c) => {
    for (const u of e.data.urls) { try { if (!(await c.match(u, { ignoreVary: true }))) await c.add(u); } catch { /* 这一个存不下就算了 */ } }
  }));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(V).then((cache) => cache.put(HOME, c)); return r; }).catch(() => caches.match(HOME, { ignoreVary: true })));
    return;
  }
  // 按网址认（不看 Vary）：补存进来的那一份是缓存自己去取的，请求头与页面发的不全一样
  e.respondWith(caches.match(req.url, { ignoreVary: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && r.type === 'basic') { const c = r.clone(); caches.open(V).then((cache) => cache.put(req, c)); }
    return r;
  })));
});
