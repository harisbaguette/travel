// 열쇠(API 키) 없이 구글에게 장소를 물어보는 창구.
// 구글 지도 "끼워 넣기(embed)" 화면은 열쇠 없이 열리는데, 그 안에 검색 결과 좌표가
// 함께 실려 온다. 브라우저가 구글에 직접 물으면 차단(CORS)되므로 서버가 대신 읽는다.
// simplify: 비공식 통로라 구글이 형식을 바꾸면 빈 결과가 된다 — 부르는 쪽(cities.ts)이
// 마지막 예비 수단으로만 쓰고, 실패해도 앱은 그대로 돈다.

interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
}

const EMBED_TIMEOUT_MS = 8000;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "ko",
};

// 좌표 항목 판별 — [식별자들, "/g/…"(구글 장소 번호), null, [위도*1e7, 경도*1e7], …] 꼴
function isLocEntry(x: unknown): x is unknown[] {
  if (!Array.isArray(x)) return false;
  const gid = x[1];
  const coord = x[3];
  return (
    typeof gid === "string" &&
    (gid.startsWith("/g/") || gid.startsWith("0x")) &&
    Array.isArray(coord) &&
    Number.isInteger(coord[0]) &&
    Number.isInteger(coord[1])
  );
}

// 결과 이름으로 써도 되는 문자열인지 — 내부 표식("/…", "gcid:…" 등)은 거른다
function isNameString(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.length > 0 &&
    s.length <= 60 &&
    !s.startsWith("/") &&
    !s.includes(":") &&
    !s.includes("-injection")
  );
}

// initEmbed(...) 안의 큰 배열을 훑어 좌표 항목을 전부 모은다.
// 이름은 좌표 묶음을 감싼 칸의 두 번째 값에 있으면 쓰고, 없으면 검색어를 그대로 쓴다.
function parseInitEmbed(html: string, query: string): PlaceResult[] {
  const start = html.indexOf("initEmbed(");
  if (start < 0) return [];
  const end = html.indexOf(");", start);
  if (end < 0) return [];
  let data: unknown;
  try {
    data = JSON.parse(html.slice(start + "initEmbed(".length, end));
  } catch {
    return [];
  }

  const out: PlaceResult[] = [];
  const walk = (node: unknown, name: string): void => {
    if (!Array.isArray(node)) return;
    const ownName =
      isNameString(node[1]) && Array.isArray(node[4]) && node[4].some(isLocEntry)
        ? node[1]
        : name;
    for (const child of node) {
      if (isLocEntry(child)) {
        const coord = child[3] as [number, number];
        const lat = coord[0] / 1e7;
        const lng = coord[1] / 1e7;
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
        out.push({ name: ownName, lat, lng });
      } else {
        walk(child, ownName);
      }
    }
  };
  walk(data, query);

  // 같은 이름이 바로 옆(약 200m 안)에 여러 개면 하나만 남긴다
  const dedup: PlaceResult[] = [];
  for (const r of out) {
    const near = dedup.some(
      (d) =>
        d.name === r.name &&
        Math.abs(d.lat - r.lat) < 0.002 &&
        Math.abs(d.lng - r.lng) < 0.002
    );
    if (!near) dedup.push(r);
  }
  return dedup;
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return Response.json({ ok: false, results: [] }, { status: 400 });
  }
  try {
    const res = await fetch(
      `https://maps.google.com/maps?q=${encodeURIComponent(q)}&hl=ko&output=embed`,
      { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(EMBED_TIMEOUT_MS) }
    );
    if (!res.ok) return Response.json({ ok: false, results: [] });
    const results = parseInitEmbed(await res.text(), q).slice(0, 5);
    return Response.json({ ok: true, results });
  } catch {
    return Response.json({ ok: false, results: [] });
  }
}
