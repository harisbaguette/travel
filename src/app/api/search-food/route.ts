import type { MapBounds, Pin } from "@/lib/types";

// Overpass API — OpenStreetMap 쿼리 엔드포인트
// 화면 범위 내 음식점/카페/바/패스트푸드 검색
// simplify: 첫 버전은 Overpass만. 평점 연동은 나중.

interface OverpassElement {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

const AMENITY_LABEL: Record<string, string> = {
  restaurant: "음식점",
  cafe: "카페",
  fast_food: "패스트푸드",
  bar: "바",
};

const OVERPASS_TIMEOUT = 30;

function buildQuery(bounds: MapBounds): string {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `[out:json][timeout:${OVERPASS_TIMEOUT}];
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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      (OVERPASS_TIMEOUT + 5) * 1000
    );

    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "TravelPinMap/1.0 (contact: travel-pin-map@example.com)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return Response.json(
        {
          ok: false,
          error: `Overpass 서버 오류 (상태 ${res.status}). 잠시 뒤 다시 시도해 주세요.`,
        },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { elements?: OverpassElement[] };
    const elements = data.elements ?? [];

    const nodes = elements.filter(
      (e) => e.type === "node" && Number.isFinite(e.lat) && Number.isFinite(e.lon)
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
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "검색 시간이 너무 오래 걸렸어요 (30초 초과). 다시 시도해 주세요."
        : "맛집 검색 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.";
    return Response.json({ ok: false, error: message }, { status: 504 });
  }
}
