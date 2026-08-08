// 구글 지도 "공유" 짧은 링크(maps.app.goo.gl 등)를 원래의 긴 주소로 펴 주는 창구.
// 브라우저에서 바로 따라가면 다른 사이트라 막히므로(CORS) 서버가 대신 따라간다.
// 아무 주소나 따라가면 위험하니(내부망 찌르기) 구글 계열 주소만, 튕길 때마다 확인하며 따라간다.

const ALLOWED_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "app.goo.gl",
  "g.co",
]);

// 구글은 나라마다 주소가 다르다(google.com, google.co.kr, google.com.vn, google.de …).
// 짧은 링크가 보는 나라에 맞는 구글 주소로 튕기므로, 구글 나라별 주소를 전부 받아 준다.
const GOOGLE_HOST = /^([a-z0-9-]+\.)*google\.(com|[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/;

function isAllowedHost(host: string): boolean {
  return ALLOWED_HOSTS.has(host) || GOOGLE_HOST.test(host);
}

function isAllowed(url: URL): boolean {
  return url.protocol === "https:" && isAllowedHost(url.hostname);
}

const MAX_HOPS = 5;

export async function GET(req: Request): Promise<Response> {
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return Response.json({ ok: false, error: "주소가 아니에요" }, { status: 400 });
  }
  if (!isAllowed(target)) {
    return Response.json(
      { ok: false, error: "구글 지도 링크만 받아요" },
      { status: 400 }
    );
  }

  try {
    // 짧은 링크는 몇 번 튕겨서(redirect) 긴 주소에 닿는다.
    // 자동으로 끝까지 따라가지 않고 한 번 튕길 때마다 구글 주소가 맞는지 확인한다.
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const res = await fetch(target.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (travel-app link expander)" },
      });
      const location = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !location) break;
      const next = new URL(location, target);
      if (!isAllowed(next)) break;
      target = next;
    }
    // 유럽 등에서 동의 화면으로 튕긴 경우 — 원래 가려던 주소가 continue에 들어 있다.
    if (target.hostname === "consent.google.com") {
      const cont = target.searchParams.get("continue");
      if (cont) {
        try {
          const contUrl = new URL(cont);
          if (isAllowed(contUrl)) target = contUrl;
        } catch {
          // continue 값이 이상하면 그대로 둔다
        }
      }
    }
    return Response.json({ ok: true, url: target.toString() });
  } catch {
    return Response.json(
      { ok: false, error: "링크를 펴지 못했어요" },
      { status: 502 }
    );
  }
}
