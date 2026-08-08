// 구글 지도 그림 조각(타일)에 "어떤 가게가 어느 자리에 그려져 있는지"를 알려 주는
// 창구(/vt/ft)를 읽는 도우미(서버 전용). 우리 지도 바탕이 바로 이 구글 조각이라,
// 사용자가 화면에서 본 가게 이름을 그대로 집어낼 수 있다 — 좌표 근처를 어림하는 게 아니라
// 구글맵처럼 "누른 그 가게"가 잡힌다.
// simplify: 타일과 같은 비공식 통로다 — 형식이 바뀌면 null이 되고, 부르는 쪽이
// 기존 OSM 어림 방식으로 되돌아간다.

const TILE = 256;
// 아이콘에서 이만큼(픽셀) 안에 누르면 그 가게를 누른 것으로 본다
const HIT_RADIUS_PX = 26;
// 누른 자리가 조각 가장자리에 이만큼 가까우면 옆 조각도 함께 읽는다
const EDGE_PX = 30;
const FT_TIMEOUT_MS = 4000;

export interface TilePoi {
  name: string;
  lat: number;
  lng: number;
  /** 버스 정류장·역 표식 — 구글이 함께 알려 준다. */
  transit: boolean;
  /** 누른 자리에서 아이콘까지의 화면 거리(픽셀). */
  distPx: number;
}

// 위도·경도 → 전 세계 픽셀 자리(해당 확대 단계 기준)
function toGlobalPx(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z * TILE;
  const rad = (lat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

function fromGlobalPx(x: number, y: number, z: number): { lat: number; lng: number } {
  const n = 2 ** z * TILE;
  const lng = (x / n) * 360 - 180;
  const yy = Math.PI * (1 - (2 * y) / n);
  return { lat: (Math.atan(Math.sinh(yy)) * 180) / Math.PI, lng };
}

// 좌표 원본 값(×32) → 요청한 확대 단계의 전 세계 픽셀.
// 조각 안 좌표는 요청한 확대 단계가 아니라 다른 단계 기준으로 실려 올 때가 있어
// (더 높은 쪽도, 낮은 쪽도 있음), 요청한 조각 근처에 떨어지는 배율을 양방향으로
// 찾아낸다. 배율이 2배씩 벌어져 맞는 배율은 하나뿐이라 안전.
function resolvePx(
  rawX: number,
  rawY: number,
  tx: number,
  ty: number
): { x: number; y: number } | null {
  for (let extra = -3; extra <= 8; extra++) {
    const x = rawX / 32 / 2 ** extra;
    const y = rawY / 32 / 2 ** extra;
    if (
      x >= (tx - 1) * TILE &&
      x < (tx + 2) * TILE &&
      y >= (ty - 1) * TILE &&
      y < (ty + 2) * TILE
    )
      return { x, y };
  }
  return null;
}

interface Candidate {
  name: string;
  transit: boolean;
  x: number;
  y: number;
}

// ft 응답은 JSON이 아니라 키에 따옴표 없는 JS 글자라 직접 훑어 읽는다(eval 금지).
function parseFt(text: string, tx: number, ty: number): Candidate[] {
  const out: Candidate[] = [];
  // 묶음 머리: {id:"…",base:[X,Y],zrange:[a,b],…  — 묶음 경계로 base를 기억해 둔다
  const groupRe = /\{id:"[a-z]+",base:\[(-?\d+),(-?\d+)\],zrange:\[\d+,\d+\]/g;
  const groups: { base: [number, number]; start: number; end: number }[] = [];
  for (let m = groupRe.exec(text); m; m = groupRe.exec(text)) {
    if (groups.length) groups[groups.length - 1].end = m.index;
    groups.push({ base: [Number(m[1]), Number(m[2])], start: m.index, end: text.length });
  }
  const featRe =
    /\{id:"\d+",a:\[([^\]]*)\](?:,bb:\[[^\]]*\])?(?:,c:"((?:[^"\\]|\\.)*)")?/g;
  for (const g of groups) {
    const body = text.slice(g.start, g.end);
    for (let m = featRe.exec(body); m; m = featRe.exec(body)) {
      const c = (m[2] ?? "").replace(/\\"/g, '"');
      const title = /title:"([^"]+)"/.exec(c)?.[1];
      if (!title) continue;
      const a = m[1].split(",").map(Number);
      // 좌표 두 벌 형식: 값이 4개 이상이면 3·4번째가 절대 자리, 2개면 base에서의 상대 자리
      const rawX = a.length >= 4 ? a[2] : g.base[0] + a[0];
      const rawY = a.length >= 4 ? a[3] : g.base[1] + a[1];
      if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) continue;
      const px = resolvePx(rawX, rawY, tx, ty);
      if (!px) continue;
      out.push({ name: title, transit: c.includes("is_transit_station:true"), ...px });
    }
    featRe.lastIndex = 0;
  }
  return out;
}

async function fetchFt(tx: number, ty: number, z: number): Promise<Candidate[]> {
  try {
    const res = await fetch(
      `https://mt0.google.com/vt/ft?lyrs=m&hl=ko&x=${tx}&y=${ty}&z=${z}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(FT_TIMEOUT_MS),
      }
    );
    if (!res.ok) return [];
    return parseFt(await res.text(), tx, ty);
  } catch {
    return [];
  }
}

/**
 * 지도에서 누른 자리(lat,lng)와 그때의 확대 단계(z)로, 화면에 그려져 있던 가게 중
 * 누른 자리와 겹치는 것을 찾아 준다. 없으면 null.
 */
export async function findTilePoiAt(
  lat: number,
  lng: number,
  zoom: number
): Promise<TilePoi | null> {
  const z = Math.min(20, Math.max(3, Math.round(zoom)));
  const click = toGlobalPx(lat, lng, z);
  const tx = Math.floor(click.x / TILE);
  const ty = Math.floor(click.y / TILE);

  // 가장자리 근처면 옆 조각(최대 4개)도 함께 읽는다 — 아이콘이 옆 조각에 그려졌을 수 있다
  const fx = click.x - tx * TILE;
  const fy = click.y - ty * TILE;
  const xs = [tx];
  const ys = [ty];
  if (fx < EDGE_PX) xs.push(tx - 1);
  else if (fx > TILE - EDGE_PX) xs.push(tx + 1);
  if (fy < EDGE_PX) ys.push(ty - 1);
  else if (fy > TILE - EDGE_PX) ys.push(ty + 1);

  const tiles: [number, number][] = [];
  for (const x of xs) for (const y of ys) tiles.push([x, y]);

  const lists = await Promise.all(tiles.map(([x, y]) => fetchFt(x, y, z)));

  let best: (Candidate & { d: number }) | null = null;
  for (const cand of lists.flat()) {
    const d = Math.hypot(cand.x - click.x, cand.y - click.y);
    if (d > HIT_RADIUS_PX) continue;
    if (!best || d < best.d) best = { ...cand, d };
  }
  if (!best) return null;

  const pos = fromGlobalPx(best.x, best.y, z);
  return {
    name: best.name,
    lat: pos.lat,
    lng: pos.lng,
    transit: best.transit,
    distPx: best.d,
  };
}
