// 핀(지도 마커) 데이터 모델 — 모든 핀 기능의 중심 타입.
// 종류 목록은 여기 한 곳에만 적는다 — 화면(pinTypes.ts)·서버 검사(api/pins)·
// 비서(api/assistant)가 전부 이 목록을 가져다 쓴다(따로 적으면 서로 어긋난다).
export const PIN_TYPE_VALUES = [
  "food",
  "spot",
  "cafe",
  "stay",
  "massage",
  "airport",
  "fruit",
  "shopping",
  "market",
  "etc",
] as const;

export type PinType = (typeof PIN_TYPE_VALUES)[number];

// 이 핀을 왜 추천했는지 보여 주는 근거 글(네이버 블로그 후기) 링크.
export interface PinSource {
  title: string;
  url: string;
}

// 옛 AI 메모 청소 — 예전 비서는 "구글 ★4.8 (리뷰 3,084개) · 해산물 · 다낭 · 2026-08-08 AI 조사"처럼
// 별점·분류·지역·날짜를 나열해 저장했다. 지금은 금지된 형식인데, 이미 저장된 핀에는 그대로 남아
// 있으므로 읽고 쓰는 길목마다 이 함수로 걸러 낸다. 그 형식에만 나오는 표식("구글 ★", "AI 조사")이
// 보이면 통째로 지운다 — 사이에 낀 분류·지역 낱말도 전부 도움 안 되는 나열이기 때문.
export function cleanLegacyAiMemo(memo: string): string {
  return /★ ?\d|\(리뷰 [\d,]+개\)|AI 조사/.test(memo) ? "" : memo;
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

// 지도 자리 없이 글로만 적는 일정 한 줄 — "렌트카 받기", "호텔 체크아웃" 같은 것.
export interface DayTextItem {
  id: string;
  text: string;
}

// 여행 일정 — 날짜별 핀 배정. simplify: 날짜 범위만 저장, 날짜 카드는 자동 생성.
export interface DayPlan {
  date: string; // YYYY-MM-DD
  pinIds: string[]; // 그 날 방문할 핀 ID, 순서대로
  // 항목별 시각(HH:MM). 키는 핀 ID 또는 글 항목 ID. 없으면 시간 미정.
  times?: Record<string, string>;
  // 글로만 적은 항목들 — 옛 저장본에는 없으므로 선택 사항.
  texts?: DayTextItem[];
  // 핀과 글 항목을 섞어 세운 순서(id 나열). 없으면 핀 먼저, 글 나중(dayEntries.dayOrder).
  order?: string[];
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
  // 아래는 나중에 추가된 칸 — 옛 저장본에는 없으므로 전부 선택 사항.
  airline?: string; // 항공사 이름
  depTerminal?: string; // 출발 터미널(T1, T2 …)
  arrTerminal?: string; // 도착 터미널
}

// 숙소 기록 — 이름 + 체크인/아웃 + 주소 + 메모.
export interface StayInfo {
  id: string;
  name: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  memo: string;
  // 숙소 주소 — 구글 지도 링크를 붙여넣으면 영문 주소로 바뀌어 남는다(입국·세관 서류용).
  // 옛 저장본에는 없으므로 선택 사항.
  address?: string;
  // 체크인/아웃 시각(HH:MM) — 옛 저장본에는 없으므로 선택 사항.
  checkInTime?: string;
  checkOutTime?: string;
  // 방 번호 — 옛 저장본에는 없으므로 선택 사항.
  roomNo?: string;
  // 구글 지도 링크로 지도에 꽂아 준 핀의 번호 — 같은 링크를 다시 붙여도 겹으로 안 꽂게 기억.
  pinId?: string;
}

// 체크리스트 한 줄 — 짐 챙기기·회의 안건·장보기가 같은 모양을 쓴다.
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  // 담당자 이름 — 장보기(누가 사 올지)·짐 챙기기(누가 챙길지)에서 사용.
  assignee?: string;
  // 결정된 내용 — 회의에서 안건마다 결과를 적는 칸.
  result?: string;
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