import type { Pin } from "./types";

// localStorage 키 — 방마다 따로 저장. 빈 방명은 "기본"으로 취급.
const storageKey = (room: string) => `travel-pins-${room || "기본"}`;

export function savePins(room: string, pins: Pin[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(room), JSON.stringify(pins));
  } catch {
    // simplify: 용량 초과 등은 무시.
  }
}

export function loadPins(room: string): Pin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(room));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Pin =>
        p &&
        typeof p.id === "string" &&
        typeof p.lat === "number" &&
        typeof p.lng === "number" &&
        typeof p.type === "string" &&
        typeof p.name === "string"
    );
  } catch {
    return [];
  }
}
