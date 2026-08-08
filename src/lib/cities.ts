// 주요 아시아 여행 도시 좌표 테이블 — [위도, 경도]
// simplify: 하드코딩. 테이블에 없으면 Nominatim API로 검색.

import { GOOGLE_MAPS_KEY, hasGoogleKey } from "./googleMaps";

export type LatLng = [number, number];

export const CITIES: Record<string, LatLng> = {
  // 베트남
  푸꾸옥: [10.2899, 103.984],
  푸쿠옥: [10.2899, 103.984],
  다낭: [16.0544, 108.2022],
  나트랑: [12.2388, 109.1967],
  하노이: [21.0278, 105.8342],
  호치민: [10.8231, 106.6297],
  달랏: [11.9404, 108.4583],
  호이안: [15.8801, 108.338],
  후에: [16.4637, 107.5909],
  // 태국
  방콕: [13.7563, 100.5018],
  치앙마이: [18.7883, 98.9853],
  푸켓: [7.8804, 98.3923],
  파타야: [12.9236, 100.8825],
  // 일본
  도쿄: [35.6762, 139.6503],
  오사카: [34.6937, 135.5023],
  후쿠오카: [33.5904, 130.4017],
  요코하마: [35.4437, 139.638],
  다카마쓰: [34.3401, 134.0436],
  삿포로: [43.0618, 141.3545],
  오키나와: [26.2124, 127.6809],
  // 대만
  타이베이: [25.033, 121.5654],
  가오슝: [22.6273, 120.3014],
  // 중국·홍콩
  홍콩: [22.3193, 114.1694],
  마카오: [22.1987, 113.5439],
  상해: [31.2304, 121.4737],
  샤먼: [24.4798, 118.0894],
  칭다오: [36.0671, 120.3826],
  // 필리핀
  세부: [10.3157, 123.8854],
  보홀: [9.6173, 123.8447],
  보라카이: [11.9667, 121.9247],
  마닐라: [14.5995, 120.9842],
  // 말레이시아·싱가포르·인도네시아
  쿠알라룸푸르: [3.139, 101.6869],
  코타키나발루: [5.9804, 116.0735],
  페낭: [5.4141, 100.3288],
  싱가포르: [1.3521, 103.8198],
  발리: [-8.4095, 115.1889],
  // 태평양
  괌: [13.4443, 144.7937],
  사이판: [15.2, 145.75],
};

// 테이블에서 도시 찾기 — 공백·대소문자 무시
export function findCity(query: string): LatLng | null {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  for (const [name, latlng] of Object.entries(CITIES)) {
    if (name.toLowerCase().replace(/\s+/g, "") === q) return latlng;
  }
  return null;
}

// Nominatim API로 장소 검색 — 테이블에 없을 때. 도시뿐 아니라 관광지·가게 이름도 찾는다.
// simplify: 첫 결과만 사용. 에러 시 null 반환.
export async function searchCity(query: string): Promise<LatLng | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      q
    )}&format=json&limit=1&accept-language=ko`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "ko,en" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
    }>;
    if (data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return [lat, lon];
  } catch {
    return null;
  }
}

// 도시 이름의 영어 표기 — 주소 사전(Nominatim)은 한국어 이름을 거의 모르기 때문에,
// 한국어 검색이 실패하면 영어로 바꿔 한 번 더 물어본다.
const CITY_EN: Record<string, string> = {
  푸꾸옥: "Phu Quoc",
  푸쿠옥: "Phu Quoc",
  다낭: "Da Nang",
  나트랑: "Nha Trang",
  하노이: "Hanoi",
  호치민: "Ho Chi Minh City",
  달랏: "Da Lat",
  호이안: "Hoi An",
  후에: "Hue",
  방콕: "Bangkok",
  치앙마이: "Chiang Mai",
  푸켓: "Phuket",
  파타야: "Pattaya",
  도쿄: "Tokyo",
  오사카: "Osaka",
  후쿠오카: "Fukuoka",
  요코하마: "Yokohama",
  다카마쓰: "Takamatsu",
  삿포로: "Sapporo",
  오키나와: "Okinawa",
  타이베이: "Taipei",
  가오슝: "Kaohsiung",
  홍콩: "Hong Kong",
  마카오: "Macau",
  상해: "Shanghai",
  샤먼: "Xiamen",
  칭다오: "Qingdao",
  세부: "Cebu",
  보홀: "Bohol",
  보라카이: "Boracay",
  마닐라: "Manila",
  쿠알라룸푸르: "Kuala Lumpur",
  코타키나발루: "Kota Kinabalu",
  페낭: "Penang",
  싱가포르: "Singapore",
  발리: "Bali",
  괌: "Guam",
  사이판: "Saipan",
  // 푸꾸옥 여행에서 자주 찾는 곳들
  즈엉동: "Duong Dong",
  빈원더스: "VinWonders",
  빈펄: "Vinpearl",
  그랜드월드: "Grand World Phu Quoc",
  사오비치: "Sao Beach",
  옹랑비치: "Ong Lang Beach",
  혼톰: "Hon Thom",
};

// 여행에서 자주 찾는 장소 낱말의 영어 표기
const WORD_EN: Record<string, string> = {
  야시장: "night market",
  시장: "market",
  공항: "airport",
  해변: "beach",
  비치: "beach",
  사원: "temple",
  절: "temple",
  폭포: "waterfall",
  역: "station",
  항구: "port",
  선착장: "pier",
  동물원: "zoo",
  수족관: "aquarium",
  박물관: "museum",
  케이블카: "cable car",
  국립공원: "national park",
  전망대: "viewpoint",
  섬: "island",
};

// "푸꾸옥 야시장" → "Phu Quoc night market" 처럼 아는 낱말만 영어로 바꾼다.
function toEnglishQuery(query: string): string | null {
  let q = query;
  for (const [ko, en] of Object.entries(CITY_EN)) q = q.split(ko).join(` ${en} `);
  for (const [ko, en] of Object.entries(WORD_EN)) q = q.split(ko).join(` ${en} `);
  q = q.replace(/\s+/g, " ").trim();
  if (q === query.trim()) return null; // 바뀐 게 없으면 다시 물을 이유가 없다
  return q;
}

// 테이블 우선 → 주소 사전(한국어 그대로) → 주소 사전(영어로 바꿔서) 순서로 찾는다.
export async function resolveCity(query: string): Promise<LatLng | null> {
  const fromTable = findCity(query);
  if (fromTable) return fromTable;
  const direct = await searchCity(query);
  if (direct) return direct;
  const en = toEnglishQuery(query);
  if (en) return searchCity(en);
  return null;
}

// ── 글자를 치는 동안 보여줄 후보 목록(자동완성) ──
// Photon(코무트가 운영하는 무료 장소 사전)을 쓴다 — 열쇠(API 키) 없이 되고,
// 글자를 치는 중에 계속 물어봐도 되는 곳이라 자동완성에 알맞다.
// Nominatim은 규칙상 자동완성에 쓰면 안 되므로 마지막 예비용으로만 남긴다.

export interface PlaceSuggestion {
  name: string; // 장소 이름
  address: string; // 주소 요약(동네·도시·나라)
  lat: number;
  lng: number;
  /** 장소가 차지하는 네모 영역 [[남,서],[북,동]] — 도시처럼 넓은 곳은 이걸로 화면을 맞춘다 */
  bounds?: [[number, number], [number, number]];
  /** 영역 정보가 없을 때 쓸 확대 정도 */
  zoom: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    osm_key?: string;
    osm_value?: string;
    extent?: [number, number, number, number]; // [서, 북, 동, 남]
  };
}

// 도시급이면 멀리서, 가게급이면 가까이서 보여준다.
function zoomFor(key?: string, value?: string): number {
  if (key === "place") {
    if (value === "city" || value === "town") return 12;
    if (value === "village" || value === "suburb") return 14;
  }
  if (key === "boundary") return 11;
  return 16;
}

async function photonSearch(
  query: string,
  near?: LatLng,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  // lang=default: 브라우저 언어와 상관없이 그 나라 현지 이름을 준다(지도 라벨과 같은 방식).
  const params = new URLSearchParams({ q: query, limit: "8", lang: "default" });
  // 지금 보고 있는 지도 근처를 먼저 보여주는 가중치
  if (near) {
    params.set("lat", String(near[0]));
    params.set("lon", String(near[1]));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const out: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const f of data.features ?? []) {
    const coord = f.geometry?.coordinates;
    const p = f.properties;
    if (!coord || !p) continue;
    const [lng, lat] = coord;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    const name = p.name ?? p.street ?? p.city;
    if (!name) continue;
    // 같은 곳이 여러 줄로 나오면 하나만 남긴다
    const key = `${name}|${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const road = [p.street, p.housenumber].filter(Boolean).join(" ");
    const addressParts: string[] = [];
    for (const part of [road, p.district, p.city, p.state, p.country]) {
      if (part && part !== name && !addressParts.includes(part)) addressParts.push(part);
    }
    const e = p.extent;
    out.push({
      name,
      address: addressParts.join(", "),
      lat,
      lng,
      bounds: e ? [[e[3], e[0]], [e[1], e[2]]] : undefined,
      zoom: zoomFor(p.osm_key, p.osm_value),
    });
    if (out.length >= 6) break;
  }
  return out;
}

// ── 구글 장소 검색(Places API) — 열쇠가 있을 때만 ──
// 구글이 모은 가게·건물 자료까지 뒤지므로, 무료 지도 사전에 없는 한국 상호도 찾는다.
interface GooglePlace {
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  viewport?: {
    low?: { latitude?: number; longitude?: number };
    high?: { latitude?: number; longitude?: number };
  };
}

async function googlePlacesSearch(
  query: string,
  near?: LatLng,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  const body: Record<string, unknown> = {
    textQuery: query,
    languageCode: "ko",
    pageSize: 6,
  };
  // 지금 보는 지도 근처를 먼저 — 반지름 50km 안을 우선한다
  if (near) {
    body.locationBias = {
      circle: {
        center: { latitude: near[0], longitude: near[1] },
        radius: 50000,
      },
    };
  }
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_KEY,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.location,places.viewport",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: GooglePlace[] };
  const out: PlaceSuggestion[] = [];
  for (const p of data.places ?? []) {
    const name = p.displayName?.text;
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (!name || typeof lat !== "number" || typeof lng !== "number") continue;
    const lo = p.viewport?.low;
    const hi = p.viewport?.high;
    const bounds =
      typeof lo?.latitude === "number" &&
      typeof lo?.longitude === "number" &&
      typeof hi?.latitude === "number" &&
      typeof hi?.longitude === "number"
        ? ([[lo.latitude, lo.longitude], [hi.latitude, hi.longitude]] as [
            [number, number],
            [number, number]
          ])
        : undefined;
    out.push({
      name,
      address: p.formattedAddress ?? "",
      lat,
      lng,
      bounds,
      zoom: 16,
    });
    if (out.length >= 6) break;
  }
  return out;
}

// 구글(열쇠 있을 때) → 무료 사전 한국어 → 무료 사전 영어 순서로 찾는다.
export async function suggestPlaces(
  query: string,
  near?: LatLng,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (hasGoogleKey()) {
    try {
      const fromGoogle = await googlePlacesSearch(q, near, signal);
      if (fromGoogle.length > 0) return fromGoogle;
    } catch (e) {
      // 도중 취소는 그대로 알리고, 그 밖의 실패는 무료 사전으로 넘어간다
      if (e instanceof DOMException && e.name === "AbortError") throw e;
    }
  }
  const direct = await photonSearch(q, near, signal);
  if (direct.length > 0) return direct;
  const en = toEnglishQuery(q);
  if (en) return photonSearch(en, near, signal);
  return [];
}
