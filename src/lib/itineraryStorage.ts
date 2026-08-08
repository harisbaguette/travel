import type {
  ChecklistItem,
  FlightInfo,
  Itinerary,
  MeetupInfo,
  StayInfo,
} from "./types";

// localStorage 키 — 방마다 따로 저장. 빈 방명은 "기본".
const storageKey = (room: string) => `travel-itinerary-${room || "기본"}`;

export const EMPTY_ITINERARY: Itinerary = {
  startDate: "",
  endDate: "",
  days: [],
};

export function saveItinerary(room: string, it: Itinerary): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(room), JSON.stringify(it));
  } catch {
    // simplify: 용량 초과 등은 무시.
  }
}

export function loadItinerary(room: string): Itinerary {
  if (typeof window === "undefined") return { ...EMPTY_ITINERARY };
  try {
    const raw = window.localStorage.getItem(storageKey(room));
    if (!raw) return { ...EMPTY_ITINERARY };
    return sanitizeItinerary(JSON.parse(raw));
  } catch {
    return { ...EMPTY_ITINERARY };
  }
}

// 서버·저장소에서 온 값을 안전한 모양으로 다듬는다. 예전 저장본(기록 칸 없음)도 그대로 통과.
export function sanitizeItinerary(value: unknown): Itinerary {
  if (!value || typeof value !== "object") return { ...EMPTY_ITINERARY };
  const parsed = value as Partial<Itinerary>;
  const it: Itinerary = {
    startDate: typeof parsed.startDate === "string" ? parsed.startDate : "",
    endDate: typeof parsed.endDate === "string" ? parsed.endDate : "",
    days: Array.isArray(parsed.days) ? parsed.days.filter(isDayPlan) : [],
  };
  if (isFlight(parsed.outbound)) it.outbound = parsed.outbound;
  if (isFlight(parsed.inbound)) it.inbound = parsed.inbound;
  if (Array.isArray(parsed.stays)) {
    const stays = parsed.stays.filter(isStay);
    if (stays.length > 0) it.stays = stays;
  }
  for (const key of ["packing", "agenda", "shopping"] as const) {
    const raw = parsed[key];
    if (!Array.isArray(raw)) continue;
    const list = raw.filter(isChecklistItem);
    if (list.length > 0) it[key] = list;
  }
  if (Array.isArray(parsed.meetups)) {
    const meetups = parsed.meetups.filter(isMeetup);
    if (meetups.length > 0) it.meetups = meetups;
  }
  return it;
}

function isDayPlan(d: unknown): d is Itinerary["days"][number] {
  if (!d || typeof d !== "object") return false;
  const o = d as { date?: unknown; pinIds?: unknown };
  return typeof o.date === "string" && Array.isArray(o.pinIds);
}

function isFlight(f: unknown): f is FlightInfo {
  if (!f || typeof f !== "object") return false;
  const o = f as Record<string, unknown>;
  return (
    typeof o.flightNo === "string" &&
    typeof o.from === "string" &&
    typeof o.to === "string" &&
    typeof o.date === "string" &&
    typeof o.depTime === "string" &&
    typeof o.arrTime === "string" &&
    typeof o.memo === "string" &&
    (o.airline === undefined || typeof o.airline === "string") &&
    (o.depTerminal === undefined || typeof o.depTerminal === "string") &&
    (o.arrTerminal === undefined || typeof o.arrTerminal === "string")
  );
}

function isChecklistItem(i: unknown): i is ChecklistItem {
  if (!i || typeof i !== "object") return false;
  const o = i as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.text === "string" &&
    typeof o.done === "boolean" &&
    (o.assignee === undefined || typeof o.assignee === "string") &&
    (o.result === undefined || typeof o.result === "string")
  );
}

function isMeetup(m: unknown): m is MeetupInfo {
  if (!m || typeof m !== "object") return false;
  const o = m as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.place === "string" &&
    typeof o.date === "string" &&
    typeof o.time === "string" &&
    typeof o.memo === "string"
  );
}

function isStay(s: unknown): s is StayInfo {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.checkIn === "string" &&
    typeof o.checkOut === "string" &&
    typeof o.memo === "string" &&
    (o.address === undefined || typeof o.address === "string") &&
    (o.checkInTime === undefined || typeof o.checkInTime === "string") &&
    (o.checkOutTime === undefined || typeof o.checkOutTime === "string")
  );
}
