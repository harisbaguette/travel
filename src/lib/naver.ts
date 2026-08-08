// 네이버 검색 — 서버에서만 부른다.
//  - 블로그 검색: 사람들이 쓴 후기 글을 찾는다. 추천 근거(출처)로 쓴다.
//  - 블로그 본문 읽기: 찾은 글을 열어 본문과, 글에 붙은 지도 카드(주소·좌표)를 꺼낸다.
//  - 장소 검색: 가게 이름으로 주소·좌표를 확인한다(국내 전용, 열쇠가 있을 때만).
//
// 열쇠(NAVER_CLIENT_ID/SECRET)가 있으면 공식 창구를 쓰고, 없으면 네이버 블로그 홈이
// 자기 화면을 채울 때 쓰는 공개 목록을 그대로 읽는다. 열쇠 없이도 후기를 찾을 수 있게
// 하려는 것이다.
// simplify: 두 번째 길은 네이버가 공식으로 연 문이 아니라, 형식이 바뀌면 빈 목록이 된다.
// 부르는 쪽이 빈 목록을 정상으로 다루므로 앱은 그대로 돈다. 자주 깨지면 열쇠를 넣는 게 정답.

const BLOG_API_URL = "https://openapi.naver.com/v1/search/blog.json";
const LOCAL_API_URL = "https://openapi.naver.com/v1/search/local.json";
const BLOG_OPEN_URL = "https://section.blog.naver.com/ajax/SearchList.naver";
const BLOG_TAB_URL = "https://search.naver.com/search.naver";
const TIMEOUT_MS = 8000;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

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

// 네이버는 검색어와 겹치는 부분을 <b>나 <strong>으로 감싸고 특수문자를 기호 이름으로 바꿔서 준다.
// 그대로 화면에 쓰면 태그가 글자로 보이므로 한 번에 벗겨 낸다.
const ENTITY: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function clean(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (m) => ENTITY[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** 열쇠가 준비돼 있는지 — 공식 창구를 쓸 수 있는지 판단할 때만 쓴다. */
function isNaverConfigured(): boolean {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

async function callNaverApi(url: string, params: URLSearchParams): Promise<unknown[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];

  const res = await fetch(`${url}?${params.toString()}`, {
    headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`네이버 검색 실패 (${res.status})`);
  const data = (await res.json()) as { items?: unknown[] };
  return Array.isArray(data.items) ? data.items : [];
}

/** 저장된 날짜값(밀리초 또는 20260808 꼴)을 YYYYMMDD 여덟 자로 맞춘다. */
function toPostdate(value: unknown): string {
  if (typeof value === "string" && /^\d{8}$/.test(value)) return value;
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 공식 창구(열쇠 필요) */
async function blogByApi(
  query: string,
  display: number,
  recent: boolean
): Promise<NaverBlogItem[]> {
  const items = await callNaverApi(
    BLOG_API_URL,
    new URLSearchParams({
      query,
      display: String(display),
      sort: recent ? "date" : "sim",
    })
  );
  const out: NaverBlogItem[] = [];
  for (const raw of items) {
    const it = raw as Record<string, unknown>;
    const url = typeof it.link === "string" ? it.link : "";
    const title = clean(it.title);
    if (!url || !title) continue;
    const snippet = clean(it.description).slice(0, 300);
    out.push({
      title,
      url,
      snippet,
      blogger: clean(it.bloggername),
      postdate: toPostdate(it.postdate),
    });
  }
  return out;
}

/** 열쇠 없는 길 ① — 블로그 홈이 검색 결과를 채울 때 쓰는 공개 목록(제목·글쓴이·날짜까지 나온다) */
async function blogByOpenList(
  query: string,
  display: number,
  recent: boolean
): Promise<NaverBlogItem[]> {
  const params = new URLSearchParams({
    countPerPage: String(display),
    currentPage: "1",
    endDate: "",
    keyword: query,
    orderBy: recent ? "recentdate" : "sim",
    startDate: "",
    type: "post",
  });
  const res = await fetch(`${BLOG_OPEN_URL}?${params.toString()}`, {
    headers: {
      ...BROWSER_HEADERS,
      Referer: "https://section.blog.naver.com/Search/Post.naver",
      Accept: "application/json, text/plain, */*",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return [];
  // 앞에 )]}', 라는 방어용 머리글이 붙어 온다 — 떼어 내야 읽을 수 있다.
  const text = (await res.text()).replace(/^\)\]\}',?\s*/, "");
  let list: unknown[] = [];
  try {
    const json = JSON.parse(text) as { result?: { searchList?: unknown[] } };
    list = Array.isArray(json.result?.searchList) ? json.result.searchList : [];
  } catch {
    return [];
  }

  const out: NaverBlogItem[] = [];
  for (const raw of list) {
    const it = raw as Record<string, unknown>;
    const url = typeof it.postUrl === "string" ? it.postUrl : "";
    const title = clean(it.noTagTitle ?? it.title);
    if (!url || !title) continue;
    const snippet = clean(it.contents).slice(0, 300);
    out.push({
      title,
      url,
      snippet,
      blogger: clean(it.nickName) || clean(it.blogName),
      postdate: toPostdate(it.addDate),
    });
  }
  return out;
}

/** 열쇠 없는 길 ② — 위가 막혔을 때, 검색 화면에서 글 주소만이라도 건진다 */
async function blogBySearchPage(query: string, display: number): Promise<NaverBlogItem[]> {
  const params = new URLSearchParams({ ssc: "tab.blog.all", query });
  const res = await fetch(`${BLOG_TAB_URL}?${params.toString()}`, {
    headers: { ...BROWSER_HEADERS, Referer: "https://www.naver.com/" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const out: NaverBlogItem[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/https:\/\/blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/g)) {
    const url = m[0];
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      // 제목 자리는 검색 화면 구조가 자주 바뀌어 못 믿는다 — 글쓴이 이름으로 대신 적는다.
      title: `${m[1]} 님의 ${query} 후기`,
      url,
      snippet: "",
      blogger: m[1],
      postdate: "",
    });
    if (out.length >= display) break;
  }
  return out;
}

/**
 * 블로그 후기 검색 — 열쇠가 있으면 공식 창구, 없으면 공개 목록을 읽는다.
 * recent=true 면 최신 글 순으로 본다(가게가 문 닫았는지, 요즘도 좋은지 확인용).
 */
export async function searchNaverBlog(
  query: string,
  display = 8,
  recent = false
): Promise<NaverBlogItem[]> {
  const q = query.trim();
  if (!q) return [];
  const count = Math.min(Math.max(Math.trunc(display) || 8, 1), 20);

  if (isNaverConfigured()) {
    const viaApi = await blogByApi(q, count, recent);
    if (viaApi.length > 0) return viaApi;
  }
  const viaOpen = await blogByOpenList(q, count, recent);
  if (viaOpen.length > 0) return viaOpen;
  return blogBySearchPage(q, count);
}

// ── 블로그 본문 읽기 ──────────────────────────────────────────────
// 검색 결과는 요약 두 줄뿐이라, AI가 글을 제대로 판단하려면 본문을 읽어야 한다.
// 네이버 블로그 글은 휴대폰용 주소로 열면 구조가 단순해서 글만 깨끗하게 뽑기 좋다.
// 글쓴이가 붙여 둔 지도 카드(가게 이름·주소·좌표)와 구글 지도 링크도 같이 건진다.

/** 글쓴이가 본문에 붙여 둔 지도 카드 — 좌표까지 정확해서 그대로 핀 자리로 쓸 수 있다. */
export interface BlogPlaceCard {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface BlogPostBody {
  url: string;
  text: string;
  places: BlogPlaceCard[];
  mapLinks: string[];
}

/** 네이버 블로그 글 주소를 휴대폰용 주소로 바꾼다. 네이버 블로그가 아니면 null. */
function toMobileBlogUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host !== "blog.naver.com" && host !== "m.blog.naver.com") return null;
    const blogId = u.searchParams.get("blogId");
    const logNo = u.searchParams.get("logNo");
    if (blogId && logNo) return `https://m.blog.naver.com/${blogId}/${logNo}`;
    const m = u.pathname.match(/^\/([A-Za-z0-9_.-]+)\/(\d+)/);
    if (m) return `https://m.blog.naver.com/${m[1]}/${m[2]}`;
    return null;
  } catch {
    return null;
  }
}

/** 본문 조각(HTML)에서 읽을 수 있는 글만 남긴다 — 줄바꿈은 살려서 문단이 뭉개지지 않게. */
function htmlToText(fragment: string): string {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/h[1-6]|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (m) => ENTITY[m] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** 본문에 붙은 지도 카드에서 가게 이름·주소·좌표를 꺼낸다. 형식이 바뀌면 빈 목록(글은 그대로 읽힌다). */
function extractPlaceCards(html: string): BlogPlaceCard[] {
  const out: BlogPlaceCard[] = [];
  for (const m of html.matchAll(/data-linkdata=(?:'([^']+)'|"([^"]+)")/g)) {
    const raw = (m[1] ?? m[2] ?? "")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/g, "'")
      .replace(/&amp;/g, "&");
    if (!raw.includes("latitude")) continue;
    try {
      const d = JSON.parse(raw) as Record<string, unknown>;
      const lat = Number(d.latitude);
      const lng = Number(d.longitude);
      const name = typeof d.name === "string" ? d.name.trim() : "";
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      if (out.some((p) => p.name === name && Math.abs(p.lat - lat) < 1e-6)) continue;
      out.push({
        name,
        address: typeof d.address === "string" ? d.address.trim() : "",
        lat,
        lng,
      });
    } catch {
      // 카드 하나가 깨져도 나머지는 계속 읽는다
    }
  }
  return out.slice(0, 12);
}

/** 본문에 적어 둔 구글 지도·네이버 지도 링크 — 글쓴이가 위치를 직접 알려 준 셈이다. */
function extractMapLinks(html: string): string[] {
  const re =
    /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:maps|www)\.google\.[a-z.]+\/maps|naver\.me|map\.naver\.com)[^\s"'<>\\)]*/g;
  const seen = new Set<string>();
  for (const m of html.matchAll(re)) {
    seen.add(m[0].replace(/&amp;/g, "&"));
    if (seen.size >= 5) break;
  }
  return [...seen];
}

/**
 * 블로그 글 하나의 본문을 읽는다. 네이버 블로그 글이 아니거나 못 열면 null.
 * maxChars 만큼만 잘라 돌려준다(AI에게 통째로 주면 느려지고 비싸진다).
 */
export async function fetchBlogPost(url: string, maxChars = 1800): Promise<BlogPostBody | null> {
  const mobile = toMobileBlogUrl(url);
  if (!mobile) return null;
  let html = "";
  try {
    const res = await fetch(mobile, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // 본문 시작점: 새 편집기(se-main-container) → 옛 편집기(post_ct) → 못 찾으면 전체.
  let start = html.indexOf("se-main-container");
  if (start < 0) start = html.indexOf('id="post_ct'); // 옛 글 형식
  const body = start >= 0 ? html.slice(start, start + 120_000) : html;
  const text = htmlToText(body).slice(0, maxChars);
  if (!text) return null;

  return {
    url,
    text,
    places: extractPlaceCards(html),
    mapLinks: extractMapLinks(body),
  };
}

/**
 * 장소 검색 — 국내 가게·명소의 주소와 좌표를 확인한다(공식 창구에만 있는 기능).
 * 열쇠가 없으면 빈 목록을 돌려준다. 부르는 쪽이 세계 장소 사전으로 넘어간다.
 */
export async function searchNaverLocal(query: string): Promise<NaverLocalItem[]> {
  const q = query.trim();
  if (!q || !isNaverConfigured()) return [];
  const items = await callNaverApi(LOCAL_API_URL, new URLSearchParams({ query: q, display: "5" }));
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
