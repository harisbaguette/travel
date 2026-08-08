// 장소 찾기 — 전부 구글 지도에 물어본다. 손으로 적어 둔 도시 좌표 표는 없다.
// 순서: 공식 구글 Places(열쇠 있을 때) → 열쇠 없는 구글(/api/search-place, embed 파싱).

import { GOOGLE_MAPS_KEY, hasGoogleKey } from "./googleMaps";

export type LatLng = [number, number];

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

// ── 구글 장소 검색(Places API) — 열쇠가 있을 때만 ──
// 구글이 모은 가게·건물 자료까지 뒤지므로, 한국 상호도 그대로 찾는다.
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

// ── 구글 검색(열쇠 없이) — 우리 서버가 구글 지도 끼워넣기 화면을 대신 읽어 준다 ──
// simplify: 위치 편향이 안 먹혀 이름으로만 찾는다. 열쇠를 등록하면 위 공식 검색이 대신한다.
async function googleEmbedSearch(
  query: string,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  try {
    const res = await fetch(`/api/search-place?q=${encodeURIComponent(query)}`, {
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: { name?: string; lat?: number; lng?: number }[];
    };
    const out: PlaceSuggestion[] = [];
    for (const r of data.results ?? []) {
      if (typeof r?.lat !== "number" || typeof r?.lng !== "number") continue;
      out.push({ name: r.name || query, address: "", lat: r.lat, lng: r.lng, zoom: 16 });
      if (out.length >= 3) break;
    }
    return out;
  } catch (e) {
    // 도중 취소는 그대로 알리고, 그 밖의 실패는 "못 찾음"으로 처리
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return [];
  }
}

// 구글에게 묻는 공통 통로: 공식 검색(열쇠 있을 때) → 열쇠 없는 검색.
async function searchGoogle(
  q: string,
  near?: LatLng,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  if (hasGoogleKey()) {
    try {
      const fromGoogle = await googlePlacesSearch(q, near, signal);
      if (fromGoogle.length > 0) return fromGoogle;
    } catch (e) {
      // 도중 취소는 그대로 알리고, 그 밖의 실패는 열쇠 없는 통로로 넘어간다
      if (e instanceof DOMException && e.name === "AbortError") throw e;
    }
  }
  return googleEmbedSearch(q, signal);
}

// 글자를 치는 동안 보여줄 후보 목록(자동완성) — 두 글자부터 묻는다(한 글자마다 묻지 않게).
export async function suggestPlaces(
  query: string,
  near?: LatLng,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return searchGoogle(q, near, signal);
}

// 이름 하나로 좌표 하나 — 구글 검색의 첫 결과를 쓴다(엔터 검색·여행 이름으로 이동용).
// 엔터로 확정한 검색이므로 "괌"처럼 한 글자 이름도 그대로 물어본다.
export async function resolveCity(query: string): Promise<LatLng | null> {
  const q = query.trim();
  if (!q) return null;
  const list = await searchGoogle(q);
  return list.length > 0 ? [list[0].lat, list[0].lng] : null;
}
