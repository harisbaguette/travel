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

// 서버 하나당 6초 안에 답이 없으면 포기한다
const PER_MIRROR_TIMEOUT_SEC = 6;
// 앞 서버 답을 이만큼 기다려 보고, 없으면 다음 서버도 겹쳐서 출발시킨다
const HEDGE_DELAY_MS = 400;

async function fetchFromMirror(
  url: string,
  query: string,
  controller: AbortController
): Promise<OverpassElement[]> {
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

/**
 * 미러를 시간차로 겹쳐 부른다 — 앞 서버가 늦으면 기다리고만 있지 않고 0.6초 뒤
 * 다음 서버도 출발시켜, 먼저 도착한 답 하나만 쓰고 나머지는 끊는다.
 * (지도 클릭 카드는 2.5초 안에 떠야 해서, 한 서버씩 차례로 기다리면 답이 못 낀다.)
 * 전부 실패하면 elements가 null이고 failures에 사유가 남는다.
 */
export async function runOverpass(
  query: string
): Promise<{ elements: OverpassElement[] | null; failures: string[] }> {
  const failures: string[] = [];
  const controllers = OVERPASS_MIRRORS.map(() => new AbortController());
  let done = false;

  const attempts = OVERPASS_MIRRORS.map((mirror, i) =>
    (async () => {
      if (i > 0)
        await new Promise((resolve) => setTimeout(resolve, i * HEDGE_DELAY_MS));
      if (done) throw new Error("hedge-skip"); // 이미 답을 얻어 출발 취소
      try {
        const elements = await fetchFromMirror(mirror, query, controllers[i]);
        done = true;
        controllers.forEach((c, j) => {
          if (j !== i) c.abort(); // 남은 서버 호출은 끊는다
        });
        return elements;
      } catch (err) {
        // 이긴 답이 이미 있으면 실패로 치지 않는다(우리가 끊은 것)
        if (!done) {
          const host = new URL(mirror).host;
          const reason =
            err instanceof Error
              ? err.name === "AbortError" || err.name === "TimeoutError"
                ? "timeout"
                : err.message
              : String(err);
          failures.push(`${host}: ${reason}`);
        }
        throw err;
      }
    })()
  );

  try {
    return { elements: await Promise.any(attempts), failures };
  } catch {
    return { elements: null, failures };
  }
}
