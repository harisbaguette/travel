import type { PinType } from "./types";

// 핀 타입별 표시 설정 — 이모지 + 색 + 한국어 이름
// simplify: 5개 고정. 사용자 정의 타입은 나중.
export interface PinTypeConfig {
  type: PinType;
  label: string;
  emoji: string;
  color: string;
}

export const PIN_TYPES: Record<PinType, PinTypeConfig> = {
  food: { type: "food", label: "맛집", emoji: "🍜", color: "#ef4444" },
  spot: { type: "spot", label: "관광지", emoji: "📸", color: "#3b82f6" },
  cafe: { type: "cafe", label: "카페", emoji: "☕", color: "#f59e0b" },
  stay: { type: "stay", label: "숙소", emoji: "🛏", color: "#22c55e" },
  etc: { type: "etc", label: "기타", emoji: "📍", color: "#94a3b8" },
};

export const PIN_TYPE_LIST: PinTypeConfig[] = [
  PIN_TYPES.food,
  PIN_TYPES.spot,
  PIN_TYPES.cafe,
  PIN_TYPES.stay,
  PIN_TYPES.etc,
];