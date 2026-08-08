import type { Pin } from "./types";

// 이름 있는 자리를 구글 지도에서 "그 장소"로 열어 주는 주소를 만든다.
// 좌표만 물으면 구글은 장소가 아니라 좌표 쪽지(10°02'00.5"N…)만 보여 준다.
// 그래서 반드시 이름으로 찾되, 같은 이름 가게가 다른 도시에도 있을 수 있으니
// 좌표를 @ 뒤에 붙여 "이 근처에서 찾아라"라고 범위를 좁혀 준다.
export function placeSearchUrl(
  name: string | null | undefined,
  lat: number,
  lng: number
): string {
  const at = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const q = (name ?? "").trim();
  // 이름이 아예 없거나, 이름 자체가 좌표 글자면 좌표로 여는 수밖에 없다
  if (!q || /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(q)) {
    return `https://www.google.com/maps/search/?api=1&query=${at}`;
  }
  return `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${at},17z`;
}

// 핀 하나를 구글 지도에서 열어 주는 주소 — 핀 이름으로 그 장소를 찾는다.
export function googleMapsUrl(pin: Pin): string {
  return placeSearchUrl(pin.name, pin.lat, pin.lng);
}

// 칸에 적힌 글로 열 주소를 만든다.
// 붙여 넣은 게 이미 링크(공유 링크 등)면 그대로 열고, 글이면 구글 지도 검색으로 연다.
export function mapHrefForText(text: string): string {
  const t = text.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return t;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t)}`;
}

// ── 반대 방향: 구글 지도 링크를 읽어 자리(좌표)와 이름을 꺼낸다 ──

/** 구글 지도 링크에서 읽어 낸 것 — 좌표가 없고 이름만 있을 수도 있다. */
export interface ParsedMapLink {
  lat?: number;
  lng?: number;
  name?: string;
}

/** 앱에서 "공유"로 만든 짧은 링크인지 — 짧은 링크는 서버가 원래 주소로 펴 줘야 읽을 수 있다. */
export function isShortMapLink(raw: string): boolean {
  try {
    const host = new URL(raw.trim()).hostname;
    return (
      host === "maps.app.goo.gl" ||
      host === "goo.gl" ||
      host === "app.goo.gl" ||
      host === "g.co"
    );
  } catch {
    return false;
  }
}

/** 구글 지도 링크로 보이는가 — 짧은 공유 링크거나 google.com/maps 계열이면 참 */
export function looksLikeMapLink(raw: string): boolean {
  const t = raw.trim();
  if (isShortMapLink(t)) return true;
  try {
    const url = new URL(t);
    const host = url.hostname.toLowerCase();
    return (
      host.includes("google") &&
      (host.startsWith("maps.") || url.pathname.startsWith("/maps"))
    );
  } catch {
    return false;
  }
}

function validCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** 구글 지도 링크를 읽는다. 좌표를 못 찾으면 이름만이라도 돌려준다(그마저 없으면 null). */
export function parseGoogleMapsUrl(raw: string): ParsedMapLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  // /maps/place/가게+이름/... — 링크에 적힌 장소 이름
  let name: string | undefined;
  const placeMatch = url.pathname.match(/\/place\/([^/]+)/);
  if (placeMatch) {
    try {
      const decoded = decodeURIComponent(placeMatch[1]).replace(/\+/g, " ").trim();
      if (decoded) name = decoded;
    } catch {
      // 깨진 글자면 이름 없이 진행
    }
  }

  // !3d위도!4d경도 — 링크가 가리키는 장소 그 자체의 좌표(화면 중심보다 정확)
  const bang = raw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bang) {
    const lat = Number(bang[1]);
    const lng = Number(bang[2]);
    if (validCoord(lat, lng)) return { lat, lng, name };
  }

  // ?q=위도,경도 / ?query=... / ?ll=... — 좌표를 그대로 적은 링크
  for (const key of ["query", "q", "ll", "center", "destination"]) {
    const v = url.searchParams.get(key);
    if (!v) continue;
    const m = v.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) {
      // 좌표가 아니라 "가게 이름"을 적은 링크 — 이름으로라도 쓴다
      if (!name && v.trim()) name = v.trim();
      continue;
    }
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (validCoord(lat, lng)) return { lat, lng, name };
  }

  // @위도,경도,줌 — 그때 보고 있던 지도 화면의 중심(마지막 수단)
  const at = raw.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (validCoord(lat, lng)) return { lat, lng, name };
  }

  return name ? { name } : null;
}
