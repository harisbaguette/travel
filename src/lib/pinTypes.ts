import type { LucideIcon } from "lucide-react";
import { BedDouble, Camera, Coffee, MapPin, Utensils } from "lucide-react";
import type { PinType } from "./types";

// 핀 타입별 표시 설정 — 아이콘(Lucide, ISC) + 색 + 한국어 이름
// emoji는 DB 저장·<option> 같은 글자만 되는 자리용으로 남긴다.
// simplify: 5개 고정. 사용자 정의 타입은 나중.
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

export const PIN_TYPE_LIST: PinTypeConfig[] = [
  PIN_TYPES.food,
  PIN_TYPES.spot,
  PIN_TYPES.cafe,
  PIN_TYPES.stay,
  PIN_TYPES.etc,
];

/** 지도 마커 안에 넣을 아이콘 SVG 문자열 — Leaflet divIcon은 React 부품 대신 글자(HTML)만 받아서. */
export function pinMarkerSvg(type: PinType, size = 15): string {
  const cfg = PIN_TYPES[type] ?? PIN_TYPES.etc;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${cfg.color}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cfg.iconPaths}</svg>`;
}
