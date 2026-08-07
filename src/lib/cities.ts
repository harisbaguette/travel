// 주요 아시아 여행 도시 좌표 테이블 — [위도, 경도]
// simplify: 하드코딩. 테이블에 없으면 Nominatim API로 검색.

export type LatLng = [number, number];

export const CITIES: Record<string, LatLng> = {
  // 일본
  도쿄: [35.6762, 139.6503],
  오사카: [34.6937, 135.5023],
  후쿠오카: [33.5904, 130.4017],
  요코하마: [35.4437, 139.638],
  다카마쓰: [34.3401, 134.0436],
  // 대만
  타이베이: [25.033, 121.5654],
  가오슝: [22.6273, 120.3014],
  // 중국·홍콩
  홍콩: [22.3193, 114.1694],
  상해: [31.2304, 121.4737],
  샤먼: [24.4798, 118.0894],
  칭다오: [36.0671, 120.3826],
  // 필리핀
  세부: [10.3157, 123.8854],
  보홀: [9.6173, 123.8447],
  보라카이: [11.9667, 121.9247],
  마닐라: [14.5995, 120.9842],
  // 말레이시아·싱가포르
  코타키나발루: [5.9804, 116.0735],
  페낭: [5.4141, 100.3288],
  싱가포르: [1.3521, 103.8198],
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

// Nominatim API로 도시 검색 — 테이블에 없을 때
// simplify: 첫 결과만 사용. 에러 시 null 반환.
export async function searchCity(query: string): Promise<LatLng | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      q
    )}&format=json&limit=1`;
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

// 테이블 우선, 없으면 Nominatim 폴백
export async function resolveCity(query: string): Promise<LatLng | null> {
  return findCity(query) ?? (await searchCity(query));
}
