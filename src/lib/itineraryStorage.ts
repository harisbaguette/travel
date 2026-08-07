import type { Itinerary } from "./types";

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
    const parsed = JSON.parse(raw) as Partial<Itinerary>;
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_ITINERARY };
    return {
      startDate: typeof parsed.startDate === "string" ? parsed.startDate : "",
      endDate: typeof parsed.endDate === "string" ? parsed.endDate : "",
      days: Array.isArray(parsed.days) ? parsed.days.filter(isDayPlan) : [],
    };
  } catch {
    return { ...EMPTY_ITINERARY };
  }
}

function isDayPlan(d: unknown): d is Itinerary["days"][number] {
  if (!d || typeof d !== "object") return false;
  const o = d as { date?: unknown; pinIds?: unknown };
  return typeof o.date === "string" && Array.isArray(o.pinIds);
}