// 핀(지도 마커) 데이터 모델 — 모든 핀 기능의 중심 타입
export type PinType = "food" | "spot" | "cafe" | "stay" | "etc";

// 이 핀을 왜 추천했는지 보여 주는 근거 글(네이버 블로그 후기) 링크.
export interface PinSource {
  title: string;
  url: string;
}

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
  // 비서가 찾아 준 도로명 주소 — 없을 수도 있다(해외 등).
  address?: string;
  // 추천 근거 링크(최대 3개). 옛 저장본에는 없으므로 선택 사항.
  sources?: PinSource[];
}

// 여행 일정 — 날짜별 핀 배정. simplify: 날짜 범위만 저장, 날짜 카드는 자동 생성.
export interface DayPlan {
  date: string; // YYYY-MM-DD
  pinIds: string[]; // 그 날 방문할 핀 ID, 순서대로
  // 핀별 방문 시각(HH:MM). 없으면 시간 미정 — 타임라인에 순서만 표시.
  times?: Record<string, string>;
}

// 비행 일정 — 가는 편/오는 편 각각 1개.
export interface FlightInfo {
  flightNo: string; // 예: VJ975
  from: string; // 출발 공항/도시
  to: string; // 도착 공항/도시
  date: string; // YYYY-MM-DD
  depTime: string; // HH:MM
  arrTime: string; // HH:MM
  memo: string;
}

// 숙소 기록 — 이름 + 체크인/아웃 + 주소 + 메모.
export interface StayInfo {
  id: string;
  name: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  memo: string;
  // 구글 지도에서 찾을 주소 — 옛 저장본에는 없으므로 선택 사항.
  address?: string;
}

// 체크리스트 한 줄 — 짐 챙기기·회의 안건·장보기가 같은 모양을 쓴다.
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  // 담당자 이름 — 장보기에서만 사용.
  assignee?: string;
}

// 집합 약속 — 언제 어디서 모일지.
// 2026-08-08 화면에서 뺐다(사용자 요청). 예전에 저장해 둔 값을 지우지 않으려고
// 저장 형식만 그대로 남겨 둔다 — 새로 적는 화면은 없다.
export interface MeetupInfo {
  id: string;
  place: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  memo: string;
}

export interface Itinerary {
  startDate: string; // YYYY-MM-DD, 빈 값 가능
  endDate: string; // YYYY-MM-DD, 빈 값 가능
  days: DayPlan[];
  // 아래는 나중에 추가된 기록 칸 — 예전 저장본에는 없을 수 있어 전부 선택 사항.
  outbound?: FlightInfo;
  inbound?: FlightInfo;
  stays?: StayInfo[];
  packing?: ChecklistItem[]; // 짐 챙길 리스트
  agenda?: ChecklistItem[]; // 회의 안건
  shopping?: ChecklistItem[]; // 장 볼 리스트(담당자 포함)
  meetups?: MeetupInfo[]; // 집합 시간
}

export const EMPTY_FLIGHT: FlightInfo = {
  flightNo: "",
  from: "",
  to: "",
  date: "",
  depTime: "",
  arrTime: "",
  memo: "",
};