// 열쇠(API 키) 없이 구글에게 장소를 물어보는 창구.
// 구글 지도 "끼워 넣기(embed)" 화면은 열쇠 없이 열리는데, 그 안에 검색 결과 좌표가
// 함께 실려 온다. 브라우저가 구글에 직접 물으면 차단(CORS)되므로 서버가 대신 읽는다.
// simplify: 비공식 통로라 구글이 형식을 바꾸면 빈 결과가 된다 — 부르는 쪽(cities.ts)이
// 마지막 예비 수단으로만 쓰고, 실패해도 앱은 그대로 돈다.

interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
  /** 구글이 알려 준 주소 — 못 찾으면 빈 칸. */
  address?: string;
}

// 찾은 곳이 딱 한 군데일 때, 구글은 그 한 곳의 "자세한 칸"을 함께 실어 보낸다.
// 그 칸은 [[번호들, "가게이름 + 주소", [위도, 경도], …], "가게이름", ["동네","시","나라"], …] 꼴이라,
// 주소 줄 묶음을 ", "로 이으면 그대로 한 줄 주소가 된다.
// 이은 글이 "가게이름 + 주소" 글의 뒤끝과 똑같은지 한 번 더 맞춰 보고 쓴다 — 엉뚱한 글을
// 주소로 착각하지 않게 하는 안전장치다. 나라마다 이름과 주소의 앞뒤 차례가 달라도 통한다.
// simplify: 여러 곳이 한꺼번에 나온 검색에는 이 칸이 없어 주소가 빈 칸이 된다 —
// 부르는 쪽이 빈 칸을 정상으로 다룬다.
interface PlaceDetail {
  address: string;
  lat: number;
  lng: number;
}

function pickDetail(data: unknown): PlaceDetail | null {
  let address = "";
  let lat = 0;
  let lng = 0;
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    const head = node[0];
    const lines = node[2];
    if (
      Array.isArray(head) &&
      typeof head[1] === "string" &&
      Array.isArray(head[2]) &&
      typeof head[2][0] === "number" &&
      typeof head[2][1] === "number" &&
      typeof node[1] === "string" &&
      Array.isArray(lines) &&
      lines.length > 0 &&
      lines.every((s) => typeof s === "string" && s.length > 0 && s.length <= 80)
    ) {
      const joined = (lines as string[]).join(", ");
      if (head[1].endsWith(joined) && joined.length > address.length) {
        address = joined;
        lat = head[2][0];
        lng = head[2][1];
      }
    }
    for (const child of node) walk(child);
  };
  walk(data);
  return address ? { address, lat, lng } : null;
}

const EMBED_TIMEOUT_MS = 8000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// 좌표 항목 판별 — [식별자들, 구글 장소 번호, null, [위도*1e7, 경도*1e7], …] 꼴.
// 장소 번호는 가게면 "/g/…"나 "0x…", 도시·지역이면 "/m/…"로 온다 — 셋 다 인정한다.
function isLocEntry(x: unknown): x is unknown[] {
  if (!Array.isArray(x)) return false;
  const gid = x[1];
  const coord = x[3];
  return (
    typeof gid === "string" &&
    (gid.startsWith("/g/") || gid.startsWith("/m/") || gid.startsWith("0x")) &&
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
  const rawJson = html.slice(start + "initEmbed(".length, end);
  let data: unknown;
  try {
    data = JSON.parse(rawJson);
  } catch {
    return [];
  }

  const out: PlaceResult[] = [];
  const walk = (node: unknown, name: string): void => {
    if (!Array.isArray(node)) return;
    const ownName =
      isNameString(node[1]) && Array.isArray(node[4]) && node[4].some(isLocEntry) ? node[1] : name;
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
      (d) => d.name === r.name && Math.abs(d.lat - r.lat) < 0.002 && Math.abs(d.lng - r.lng) < 0.002
    );
    if (!near) dedup.push(r);
  }
  // 주소는 그 자세한 칸이 가리키는 바로 그 자리(약 100m 안)에만 붙인다 —
  // 여러 곳이 나온 검색에서 남의 주소가 딸려 붙는 것을 막는다.
  const detail = pickDetail(data);
  if (!detail) return dedup;
  return dedup.map((r) =>
    Math.abs(r.lat - detail.lat) < 0.001 && Math.abs(r.lng - detail.lng) < 0.001
      ? { ...r, address: detail.address }
      : r
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  // 어느 나라 말로 답을 받을지 — 기본은 한국어, en이면 영문 주소로 받는다
  // (비행기에서 적는 입국·세관 서류의 체류지 칸은 영문으로만 받아 준다).
  const lang = params.get("lang") === "en" ? "en" : "ko";
  if (!q) {
    return Response.json({ ok: false, results: [] }, { status: 400 });
  }
  try {
    const res = await fetch(
      `https://maps.google.com/maps?q=${encodeURIComponent(q)}&hl=${lang}&output=embed`,
      {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": lang },
        signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
      }
    );
    if (!res.ok) return Response.json({ ok: false, results: [] });
    const results = parseInitEmbed(await res.text(), q).slice(0, 5);
    return Response.json({ ok: true, results });
  } catch {
    return Response.json({ ok: false, results: [] });
  }
}
