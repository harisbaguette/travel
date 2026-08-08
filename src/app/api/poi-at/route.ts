// 지도에서 손가락으로 누른 자리에 "뭐가 있는지" 알려 주는 창구.
// 1) 그 자리 45m 안의 이름 있는 장소(가게·식당·관광지 등)를 OpenStreetMap 자료에서 찾고,
// 2) 없으면 그 자리 주소라도 알려 준다(Nominatim 역주소 조회).
// simplify: 지도 그림(구글)과 자료 창고(OSM)가 달라, 구글 지도에만 있는 가게는 주소로 나온다.

import { runOverpass, type OverpassElement } from "@/lib/overpass";

const RADIUS_M = 45;

export interface PoiInfo {
  kind: "poi" | "address";
  name: string;
  category?: string;
  lat: number;
  lng: number;
  hours?: string;
  phone?: string;
  website?: string;
}

const AMENITY_KO: Record<string, string> = {
  restaurant: "음식점",
  cafe: "카페",
  fast_food: "패스트푸드",
  bar: "바",
  pub: "펍",
  ice_cream: "아이스크림 가게",
  pharmacy: "약국",
  hospital: "병원",
  clinic: "의원",
  bank: "은행",
  atm: "현금인출기",
  fuel: "주유소",
  police: "경찰서",
  place_of_worship: "사원·교회",
  marketplace: "시장",
  ferry_terminal: "선착장",
};

const SHOP_KO: Record<string, string> = {
  convenience: "편의점",
  supermarket: "마트",
  bakery: "빵집",
  clothes: "옷 가게",
  gift: "기념품 가게",
  jewelry: "귀금속 가게",
  seafood: "수산물 가게",
};

const TOURISM_KO: Record<string, string> = {
  attraction: "관광지",
  museum: "박물관",
  viewpoint: "전망대",
  theme_park: "테마파크",
  zoo: "동물원",
  aquarium: "수족관",
  hotel: "호텔",
  guest_house: "게스트하우스",
  hostel: "호스텔",
  resort: "리조트",
};

function categoryLabel(tags: Record<string, string>): string {
  if (tags.amenity) return AMENITY_KO[tags.amenity] ?? "편의시설";
  if (tags.shop) return SHOP_KO[tags.shop] ?? "가게";
  if (tags.tourism) return TOURISM_KO[tags.tourism] ?? "관광지";
  if (tags.leisure) return "여가 시설";
  if (tags.historic) return "유적";
  if (tags.office) return "사무실";
  if (tags.craft) return "공방";
  if (tags.healthcare) return "의료 시설";
  return "장소";
}

// 짧은 거리 비교용 — 위도 차 + (경도 차 × 위도 보정)의 제곱 합. 45m 반경이면 충분히 정확.
function dist2(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const kx = Math.cos((lat1 * Math.PI) / 180);
  const dy = lat1 - lat2;
  const dx = (lng1 - lng2) * kx;
  return dy * dy + dx * dx;
}

function elementCoord(e: OverpassElement): { lat: number; lng: number } | null {
  if (Number.isFinite(e.lat) && Number.isFinite(e.lon))
    return { lat: e.lat as number, lng: e.lon as number };
  if (e.center && Number.isFinite(e.center.lat) && Number.isFinite(e.center.lon))
    return { lat: e.center.lat, lng: e.center.lon };
  return null;
}

async function findNearbyPoi(lat: number, lng: number): Promise<PoiInfo | null> {
  const keys = "amenity|shop|tourism|leisure|office|craft|historic|healthcare";
  const query = `[out:json][timeout:6];
  (
    node(around:${RADIUS_M},${lat},${lng})["name"][~"^(${keys})$"~"."];
    way(around:${RADIUS_M},${lat},${lng})["name"][~"^(${keys})$"~"."];
  );
  out tags center 12;`;

  const { elements } = await runOverpass(query);
  if (!elements) return null;

  let best: { info: PoiInfo; d: number } | null = null;
  for (const e of elements) {
    const tags = e.tags ?? {};
    const name = tags["name:ko"] ?? tags.name;
    const coord = elementCoord(e);
    if (!name || !coord) continue;
    const d = dist2(lat, lng, coord.lat, coord.lng);
    if (best && best.d <= d) continue;
    best = {
      d,
      info: {
        kind: "poi",
        name,
        category: categoryLabel(tags),
        lat: coord.lat,
        lng: coord.lng,
        hours: tags.opening_hours,
        phone: tags.phone ?? tags["contact:phone"],
        website: tags.website ?? tags["contact:website"],
      },
    };
  }
  return best?.info ?? null;
}

// 장소가 없을 때 — 그 자리 주소라도. 너무 긴 주소는 앞쪽만 잘라 보여 준다.
async function reverseAddress(lat: number, lng: number): Promise<PoiInfo | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=17&accept-language=ko`,
      {
        headers: { "User-Agent": "TravelPinMap/1.0" },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    if (!data.display_name) return null;
    const name = data.display_name.split(",").slice(0, 3).join(",").trim();
    return { kind: "address", name, lat, lng };
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json(
      { ok: false, error: "좌표가 올바르지 않아요." },
      { status: 400 }
    );
  }

  const poi = (await findNearbyPoi(lat, lng)) ?? (await reverseAddress(lat, lng));
  return Response.json({ ok: true, poi });
}
