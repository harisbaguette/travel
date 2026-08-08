// 네이버 검색 API — 서버에서만 부른다(열쇠가 밖으로 새면 안 되므로).
//  - 블로그 검색: 사람들이 쓴 후기 글을 찾는다. 추천 근거(출처)로 쓴다.
//  - 장소 검색: 가게 이름으로 주소·좌표를 확인한다(국내 전용).
// 열쇠는 developers.naver.com 에서 애플리케이션을 등록하고 "검색" API를 골라 받는다.

const BLOG_URL = "https://openapi.naver.com/v1/search/blog.json";
const LOCAL_URL = "https://openapi.naver.com/v1/search/local.json";
const TIMEOUT_MS = 8000;

/** 네이버 열쇠가 아예 없을 때 — 부르는 쪽이 미리 안내하고 끝내라는 신호. */
export class NaverNotConfiguredError extends Error {
  constructor() {
    super("네이버 검색 열쇠(NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)가 없습니다.");
    this.name = "NaverNotConfiguredError";
  }
}

export interface NaverBlogItem {
  title: string;
  url: string;
  snippet: string;
  blogger: string;
  postdate: string;
}

export interface NaverLocalItem {
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  url: string;
}

// 네이버는 검색어와 겹치는 부분을 <b>로 감싸고 특수문자를 기호 이름으로 바꿔서 준다.
// 그대로 화면에 쓰면 태그가 글자로 보이므로 한 번에 벗겨 낸다.
const ENTITY: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function clean(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<\/?b>/gi, "")
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITY[m] ?? m)
    .trim();
}

/** 열쇠가 준비돼 있는지 — 실제로 부르기 전에 미리 확인할 때 쓴다. */
export function isNaverConfigured(): boolean {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

async function callNaver(url: string, params: URLSearchParams): Promise<unknown[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) throw new NaverNotConfiguredError();

  const res = await fetch(`${url}?${params.toString()}`, {
    headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`네이버 검색 실패 (${res.status})`);
  const data = (await res.json()) as { items?: unknown[] };
  return Array.isArray(data.items) ? data.items : [];
}

/** 블로그 후기 검색 — 정확도(sim) 순으로 최대 display개. */
export async function searchNaverBlog(
  query: string,
  display = 5
): Promise<NaverBlogItem[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({
    query: q,
    display: String(Math.min(Math.max(Math.trunc(display) || 5, 1), 20)),
    sort: "sim",
  });
  const items = await callNaver(BLOG_URL, params);
  const out: NaverBlogItem[] = [];
  for (const raw of items) {
    const it = raw as Record<string, unknown>;
    const url = typeof it.link === "string" ? it.link : "";
    const title = clean(it.title);
    if (!url || !title) continue;
    out.push({
      title,
      url,
      snippet: clean(it.description),
      blogger: clean(it.bloggername),
      postdate: typeof it.postdate === "string" ? it.postdate : "",
    });
  }
  return out;
}

/** 장소 검색 — 국내 가게·명소의 주소와 좌표를 확인한다. display는 5가 최대. */
export async function searchNaverLocal(query: string): Promise<NaverLocalItem[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({ query: q, display: "5" });
  const items = await callNaver(LOCAL_URL, params);
  const out: NaverLocalItem[] = [];
  for (const raw of items) {
    const it = raw as Record<string, unknown>;
    // mapx/mapy는 WGS84 좌표에 1000만을 곱한 정수 문자열이다. 없으면 지도에 못 꽂으니 버린다.
    const x = Number(it.mapx);
    const y = Number(it.mapy);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) continue;
    const name = clean(it.title);
    if (!name) continue;
    out.push({
      name,
      category: clean(it.category),
      address: clean(it.roadAddress) || clean(it.address),
      lat: y / 1e7,
      lng: x / 1e7,
      url: typeof it.link === "string" ? it.link : "",
    });
  }
  return out;
}
