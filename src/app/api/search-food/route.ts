import type { MapBounds, Pin } from "@/lib/types";
import {
  PER_MIRROR_TIMEOUT_SEC,
  runOverpass,
  type OverpassElement,
} from "@/lib/overpass";

// Overpass API — OpenStreetMap 쿼리 엔드포인트
// 화면 범위 내 음식점/카페/바/패스트푸드 검색
// simplify: 첫 버전은 Overpass만. 평점 연동은 나중.

const AMENITY_LABEL: Record<string, string> = {
  restaurant: "음식점",
  cafe: "카페",
  fast_food: "패스트푸드",
  bar: "바",
};

// Vercel 함수 실행 시간 상한 — 미러 4곳 × 8초 + 파싱 여유
export const maxDuration = 60;

function buildQuery(bounds: MapBounds): string {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `[out:json][timeout:${PER_MIRROR_TIMEOUT_SEC}];
  (
    node["amenity"="restaurant"](${bbox});
    node["amenity"="cafe"](${bbox});
    node["amenity"="fast_food"](${bbox});
    node["amenity"="bar"](${bbox});
  );
  out body;`;
}

export async function POST(request: Request): Promise<Response> {
  let body: MapBounds & { city?: string };
  try {
    body = (await request.json()) as MapBounds & { city?: string };
  } catch {
    return Response.json(
      { ok: false, error: "요청 형식이 잘못되었어요." },
      { status: 400 }
    );
  }

  const { north, south, east, west } = body;
  if (
    !Number.isFinite(north) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(west)
  ) {
    return Response.json(
      { ok: false, error: "지도 범위 값이 올바르지 않아요." },
      { status: 400 }
    );
  }

  const query = buildQuery({ north, south, east, west });

  const { elements, failures } = await runOverpass(query);

  if (elements === null) {
    return Response.json(
      {
        ok: false,
        error:
          "지도 정보를 주는 서버들이 지금 모두 바빠요. 잠시 뒤 다시 시도해 주세요.",
        detail: failures,
      },
      { status: 502 }
    );
  }

  const nodes = elements.filter(
    (e): e is OverpassElement & { lat: number; lon: number } =>
      e.type === "node" && Number.isFinite(e.lat) && Number.isFinite(e.lon)
  );

  const limited = nodes.slice(0, 15);

  const pins: Pin[] = limited.map((node, idx) => {
    const tags = node.tags ?? {};
    const name = tags.name ?? "이름 없음";
    const amenity = tags.amenity ?? "restaurant";
    const cuisine = tags.cuisine ? ` · ${tags.cuisine}` : "";
    const memo = `${AMENITY_LABEL[amenity] ?? "음식점"}${cuisine}`;

    return {
      id: `ai-${node.id}-${idx}`,
      lat: node.lat,
      lng: node.lon,
      type: "food",
      name,
      memo,
      emoji: "🍜",
      isAI: true,
      createdAt: Date.now() + idx,
    };
  });

  return Response.json({ ok: true, pins });
}
