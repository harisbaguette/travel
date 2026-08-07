// 핀(지도 마커) 데이터 모델 — 모든 핀 기능의 중심 타입
export type PinType = "food" | "spot" | "cafe" | "stay" | "etc";

export interface Pin {
  id: string;
  lat: number;
  lng: number;
  type: PinType;
  name: string;
  memo: string;
  emoji: string;
  isAI: boolean;
  createdAt: number;
  // 누가 찍었는지 구분(같이 편집). 없으면 본인이 찍은 것으로 간주.
  createdBy?: string;
}

// Overpass API 검색용 화면 범위 — Leaflet getBounds() 그대로 매핑
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// /api/search-food 응답 형태
export interface SearchFoodResponse {
  ok: boolean;
  pins?: Pin[];
  error?: string;
}

// 여행 일정 — 날짜별 핀 배정. simplify: 날짜 범위만 저장, 날짜 카드는 자동 생성.
export interface DayPlan {
  date: string; // YYYY-MM-DD
  pinIds: string[]; // 그 날 방문할 핀 ID, 순서대로
}

export interface Itinerary {
  startDate: string; // YYYY-MM-DD, 빈 값 가능
  endDate: string; // YYYY-MM-DD, 빈 값 가능
  days: DayPlan[];
}