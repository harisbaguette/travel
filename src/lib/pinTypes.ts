import type { PinType } from "./types";

// 핀 타입별 표시 설정 — 이모지 + 색 + 한국어 이름
// simplify: 5개 고정. 사용자 정의 타입은 나중.
export interface PinTypeConfig {
  type: PinType;
  label: string;
  emoji: string;
  color: string;
}

// 색은 DW(Doweek) 잉크 팔레트에서 가져왔다 — 형광 원색 대신 눌러 쓴 잉크의 무게.
export const PIN_TYPES: Record<PinType, PinTypeConfig> = {
  food: { type: "food", label: "맛집", emoji: "🍜", color: "#df4b46" },
  spot: { type: "spot", label: "관광지", emoji: "📸", color: "#3d79c0" },
  cafe: { type: "cafe", label: "카페", emoji: "☕", color: "#93550f" },
  stay: { type: "stay", label: "숙소", emoji: "🛏", color: "#006f6c" },
  etc: { type: "etc", label: "기타", emoji: "📍", color: "#88837c" },
};

export const PIN_TYPE_LIST: PinTypeConfig[] = [
  PIN_TYPES.food,
  PIN_TYPES.spot,
  PIN_TYPES.cafe,
  PIN_TYPES.stay,
  PIN_TYPES.etc,
];