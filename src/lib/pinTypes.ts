import type { LucideIcon } from "lucide-react";
import {
  Apple,
  BedDouble,
  Camera,
  Coffee,
  Flower2,
  MapPin,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Utensils,
} from "lucide-react";
import type { PinType } from "./types";

// 핀 타입별 표시 설정 — 아이콘(Lucide, ISC) + 색 + 한국어 이름
// emoji는 DB 저장·<option> 같은 글자만 되는 자리용으로 남긴다.
// simplify: 10개 고정. 사용자 정의 타입은 나중.
export interface PinTypeConfig {
  type: PinType;
  label: string;
  emoji: string;
  color: string;
  /** React 화면에서 쓰는 아이콘 부품 */
  Icon: LucideIcon;
  /** 지도 마커(divIcon)용 SVG 속 그림 선 — 설치된 lucide-react 1.30.0에서 그대로 옮겨 적음 */
  iconPaths: string;
}

// 색은 DW(Doweek) 잉크 팔레트에서 가져왔다 — 형광 원색 대신 눌러 쓴 잉크의 무게.
export const PIN_TYPES: Record<PinType, PinTypeConfig> = {
  food: {
    type: "food",
    label: "맛집",
    emoji: "🍜",
    color: "#df4b46",
    Icon: Utensils,
    iconPaths:
      '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  },
  spot: {
    type: "spot",
    label: "관광지",
    emoji: "📸",
    color: "#3d79c0",
    Icon: Camera,
    iconPaths:
      '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  },
  cafe: {
    type: "cafe",
    label: "카페",
    emoji: "☕",
    color: "#93550f",
    Icon: Coffee,
    iconPaths:
      '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  },
  stay: {
    type: "stay",
    label: "숙소",
    emoji: "🛏",
    color: "#006f6c",
    Icon: BedDouble,
    iconPaths:
      '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/>',
  },
  massage: {
    type: "massage",
    label: "마사지",
    emoji: "💆",
    color: "#a05a97",
    Icon: Flower2,
    iconPaths:
      '<path d="M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1"/><circle cx="12" cy="8" r="2"/><path d="M12 10v12"/><path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z"/><path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z"/>',
  },
  airport: {
    type: "airport",
    label: "공항",
    emoji: "✈️",
    color: "#5b7c99",
    Icon: Plane,
    iconPaths:
      '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  },
  fruit: {
    type: "fruit",
    label: "과일가게",
    emoji: "🍎",
    color: "#c96a1a",
    Icon: Apple,
    iconPaths:
      '<path d="M12 6.528V3a1 1 0 0 1 1-1h0"/><path d="M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21"/>',
  },
  shopping: {
    type: "shopping",
    label: "쇼핑",
    emoji: "🛍️",
    color: "#6f5cb8",
    Icon: ShoppingBag,
    iconPaths:
      '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
  },
  market: {
    type: "market",
    label: "시장·마트",
    emoji: "🛒",
    color: "#5c8033",
    Icon: ShoppingCart,
    iconPaths:
      '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  },
  etc: {
    type: "etc",
    label: "기타",
    emoji: "📍",
    color: "#88837c",
    Icon: MapPin,
    iconPaths:
      '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  },
};

// Display order (chips in the list filter and the pin sheet's first row).
// Shopping outranks stay — stays are planned in the prepare tab, rarely pinned.
export const PIN_TYPE_LIST: PinTypeConfig[] = [
  PIN_TYPES.food,
  PIN_TYPES.spot,
  PIN_TYPES.cafe,
  PIN_TYPES.shopping,
  PIN_TYPES.massage,
  PIN_TYPES.airport,
  PIN_TYPES.fruit,
  PIN_TYPES.stay,
  PIN_TYPES.market,
  PIN_TYPES.etc,
];

/** 우표 몸 테두리 길(path) — 네모의 네 변에 반원 홈을 3개씩 파서 우표의 톱니 가장자리를 만든다.
 *  s=한 변 길이, r=홈 반지름. 길은 시계 방향(위→오른쪽→아래→왼쪽)으로 돈다. */
function stampPath(s: number, r: number): string {
  const centers = [s * 0.25, s * 0.5, s * 0.75];
  let d = "M0 0";
  for (const x of centers) d += `L${x - r} 0A${r} ${r} 0 0 0 ${x + r} 0`;
  d += `L${s} 0`;
  for (const y of centers) d += `L${s} ${y - r}A${r} ${r} 0 0 0 ${s} ${y + r}`;
  d += `L${s} ${s}`;
  for (const x of centers) d += `L${s - x + r} ${s}A${r} ${r} 0 0 0 ${s - x - r} ${s}`;
  d += `L0 ${s}`;
  for (const y of centers) d += `L0 ${s - y + r}A${r} ${r} 0 0 0 0 ${s - y - r}`;
  return d + "Z";
}

// 우표 한 변 30, 톱니 홈 반지름 2 — 마커마다 같은 몸이라 한 번만 만들어 둔다.
const STAMP_BODY = stampPath(30, 2);

/** 지도 마커 SVG 통짜 그림 — Leaflet divIcon은 React 부품 대신 글자(HTML)만 받아서.
 *  모양은 "여행 수첩에 꽂은 우표 압정": 톱니 가장자리 흰 우표 + 종류색 테두리·그림 +
 *  종류색 바늘대(흰 옷 입힘) + 바늘 끝 그림자. 구글 POI(색 동그라미+흰 그림)와는
 *  바탕색·윤곽 모양이 모두 반대라 한눈에 갈린다. tiltDeg는 우표 머리만 살짝 기울여
 *  손으로 붙인 스티커 느낌을 준다(바늘은 수직 그대로, 가리키는 점도 그대로). */
export function pinMarkerSvg(type: PinType, tiltDeg = 0): string {
  const cfg = PIN_TYPES[type] ?? PIN_TYPES.etc;
  const c = cfg.color;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="36" height="46" aria-hidden="true">` +
    `<ellipse cx="18" cy="44" rx="5" ry="1.6" fill="rgba(36,30,25,0.25)"/>` +
    `<rect x="15.75" y="27" width="4.5" height="17" rx="2.25" fill="#fff"/>` +
    `<rect x="16.5" y="27.5" width="3" height="15.5" rx="1.5" fill="${c}"/>` +
    `<g transform="rotate(${tiltDeg} 18 30)"><g transform="translate(3 1)">` +
    `<path d="${STAMP_BODY}" fill="#fff" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>` +
    `<g transform="translate(7.5 7.5) scale(0.625)" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${cfg.iconPaths}</g>` +
    `</g></g></svg>`
  );
}
