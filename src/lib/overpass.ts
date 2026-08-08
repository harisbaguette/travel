// Overpass — OpenStreetMap 자료 창고에 질문을 보내는 공용 도우미(서버 전용).
// 클라우드(Vercel)발 요청을 406/504로 거절하는 서버가 있어 여러 곳을 차례로 시도한다.
// 공식 공개 인스턴스 목록: https://wiki.openstreetmap.org/wiki/Overpass_API (2026-08 확인)

export interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  /** way/relation은 좌표 대신 중심점이 온다(out center) */
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// 서버 하나당 8초 안에 답이 없으면 다음 서버로 넘어간다 (전체가 늦어지지 않게)
const PER_MIRROR_TIMEOUT_SEC = 8;

async function fetchFromMirror(
  url: string,
  query: string
): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    PER_MIRROR_TIMEOUT_SEC * 1000
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "TravelPinMap/1.0 (contact: travel-pin-map@example.com)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }

    const data = (await res.json()) as { elements?: OverpassElement[] };
    return data.elements ?? [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 미러를 차례로 시도한다. 전부 실패하면 elements가 null이고 failures에 사유가 남는다. */
export async function runOverpass(
  query: string
): Promise<{ elements: OverpassElement[] | null; failures: string[] }> {
  const failures: string[] = [];
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      return { elements: await fetchFromMirror(mirror, query), failures };
    } catch (err) {
      // 이 서버는 실패 — 다음 미러로 (실패 사유는 진단용으로 수집)
      const host = new URL(mirror).host;
      const reason =
        err instanceof Error
          ? err.name === "AbortError" || err.name === "TimeoutError"
            ? "timeout"
            : err.message
          : String(err);
      failures.push(`${host}: ${reason}`);
    }
  }
  return { elements: null, failures };
}
