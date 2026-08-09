// 홈 화면에 설치된 앱처럼 쓰기 위한 최소 서비스워커.
// simplify: 화면(HTML) 이동 요청만 다룬다. 평소엔 항상 인터넷에서 새로 받아오고,
// 인터넷이 끊겼을 때만 마지막으로 받아둔 화면을 보여준다.
// 지도·검색 같은 API 응답은 일부러 저장하지 않는다(오래된 데이터가 보이면 안 되므로).
// 오프라인에서 화면 전체가 제대로 돌아가야 한다면 Serwist 같은 도구로 올려야 한다.

const CACHE = "pinmap-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(["/", "/icon-192.png", "/icon-512.png"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put("/", copy)).catch(() => undefined);
        return res;
      })
      .catch(() => caches.match("/").then((hit) => hit || Response.error())),
  );
});
