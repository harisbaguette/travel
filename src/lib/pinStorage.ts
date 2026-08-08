import { cleanLegacyAiMemo, type Pin } from "./types";

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
    return parsed
      .filter(
        (p): p is Pin =>
          p &&
          typeof p.id === "string" &&
          typeof p.lat === "number" &&
          typeof p.lng === "number" &&
          typeof p.type === "string" &&
          typeof p.name === "string"
      )
      // 예전 캐시 손보기 — createdBy='AI'는 사람이 아니므로 주인 없음 처리,
      // 별점 나열식 옛 AI 메모는 지운다(내려받기 없이 캐시로만 쓰는 핀도 있어 여기서 걸러야 함).
      .map((p) => ({
        ...p,
        memo: cleanLegacyAiMemo(typeof p.memo === "string" ? p.memo : ""),
        createdBy: p.createdBy === "AI" ? undefined : p.createdBy,
      }));
  } catch {
    return [];
  }
}
