"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Itinerary, Pin } from "./types";

// 폴링 동기화 — Neon(Postgres)에는 Supabase처럼 "바뀌면 알려주는" 기능이 없어서
// 3초마다 "새로 바뀐 거 있어?"라고 서버에 물어본다. 2~5명이 쓰는 방에는 충분하다.
//
// API 응답 규격(묶음 B가 이 규격대로 라우트를 구현한다):
//   GET    /api/pins?room=&since=      → { ok, configured, serverNow, pins: RemotePin[] }
//   POST   /api/pins  {room, pin}      → { ok, updatedAt }
//   DELETE /api/pins?room=&id=         → { ok, updatedAt }
//   GET    /api/itinerary?room=        → { ok, configured, itinerary, updatedAt }
//   POST   /api/itinerary {room, itinerary} → { ok, updatedAt }
//
// - since(밀리초, 서버 시각 기준) 이후 바뀐 핀만 돌아온다. 지운 핀은 deleted:true로 표시된 채 돌아온다.
// - configured:false거나 serverNow가 없으면(DB 미설정·구버전 API) 폴링을 아예 멈춘다.
// - 충돌 규칙: updatedAt(서버가 찍은 시각)이 큰 쪽이 이긴다. 내가 방금 보낸 변경이
//   폴링으로 되돌아오면 무시한다 — 보낼 때 받은 updatedAt을 기억해 뒀다가 비교.

export type RemotePin = Pin & { updatedAt: number; deleted?: boolean };

const POLL_MS = 3000;
const MAX_BACKOFF_MS = 30000;

// 내가 보낸 변경의 서버 시각 기록(핀 id → updatedAt). 폴링 응답에서 메아리를 걸러낸다.
const ownPinWrites = new Map<string, number>();
let ownItineraryWriteAt = 0;

// DB 설정 여부는 첫 응답에서 알게 되며, 한 번 false면 다시 묻지 않는다.
let dbConfigured: boolean | null = null;

interface PinsPollResponse {
  ok?: boolean;
  configured?: boolean;
  serverNow?: number;
  pins?: RemotePin[];
}

interface ItineraryPollResponse {
  ok?: boolean;
  configured?: boolean;
  itinerary?: Itinerary | null;
  updatedAt?: number;
}

interface PushResponse {
  ok?: boolean;
  configured?: boolean;
  updatedAt?: number;
}

// 보내는 도중에 "DB 없음"으로 바뀔 수 있으므로 그때그때 다시 읽는다.
function isNotConfigured(): boolean {
  return dbConfigured === false;
}

// 서버가 "DB 없음"이라고 답하면 혼자 쓰기 모드로 내려간다 — 이건 실패가 아니다.
function noteNotConfigured(data: PushResponse): boolean {
  if (data.configured === false) {
    dbConfigured = false;
    return true;
  }
  return false;
}

// ---------- 저장 상태 알림 ----------
// 서버로 보내는 중인지, 잘 갔는지, 실패했는지를 화면에 한 줄로 보여주기 위한 작은 알림판.
// 실패는 사용자가 "다시 보내기"를 누를 때까지 지워지지 않는다(조용히 삼키지 않는다).

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

let saveStatus: SaveStatus = "idle";
let pendingWrites = 0;
let savedTimer: ReturnType<typeof setTimeout> | null = null;
const saveListeners = new Set<() => void>();

function emitSave(next: SaveStatus): void {
  if (saveStatus === next) return;
  saveStatus = next;
  for (const listen of saveListeners) listen();
}

function beginWrite(): void {
  pendingWrites += 1;
  if (savedTimer) {
    clearTimeout(savedTimer);
    savedTimer = null;
  }
  if (saveStatus !== "failed") emitSave("saving");
}

function endWrite(ok: boolean): void {
  pendingWrites = Math.max(pendingWrites - 1, 0);
  // 서버 DB가 아예 없는 설정이면 혼자 쓰기 모드다 — 실패로 겁주지 않는다.
  if (dbConfigured === false) {
    if (pendingWrites === 0) emitSave("idle");
    return;
  }
  if (!ok) {
    emitSave("failed");
    return;
  }
  if (pendingWrites > 0 || saveStatus === "failed") return;
  emitSave("saved");
  savedTimer = setTimeout(() => {
    savedTimer = null;
    emitSave("idle");
  }, 2000);
}

function subscribeSave(listen: () => void): () => void {
  saveListeners.add(listen);
  return () => {
    saveListeners.delete(listen);
  };
}

const getSaveSnapshot = (): SaveStatus => saveStatus;
const getSaveServerSnapshot = (): SaveStatus => "idle";

export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(subscribeSave, getSaveSnapshot, getSaveServerSnapshot);
}

// 못 보낸 것만 따로 적어 둔다. 전부 다시 보내면 그 사이 친구가 바꾼 것까지 내 옛 사본으로
// 덮어써 버리므로, 실패한 그 항목만 다시 보낸다.
const failedPins = new Map<string, Pin>();
const failedDeletes = new Set<string>();
let failedItinerary: Itinerary | null = null;
let failedRoom = "";

function noteFailure(room: string): void {
  failedRoom = room;
}

// 못 보낸 것만 다시 보낸다.
export async function retryFailed(): Promise<boolean> {
  const room = failedRoom;
  if (!room || dbConfigured === false) return false;
  const pins = [...failedPins.values()];
  const deletes = [...failedDeletes];
  const itinerary = failedItinerary;
  if (pins.length === 0 && deletes.length === 0 && !itinerary) {
    emitSave("idle");
    return true;
  }
  if (saveStatus === "failed") emitSave("idle");
  beginWrite();
  let ok = true;
  for (const pin of pins) {
    if (await sendPin(room, pin)) failedPins.delete(pin.id);
    else ok = false;
  }
  for (const id of deletes) {
    if (await sendPinDelete(room, id)) failedDeletes.delete(id);
    else ok = false;
  }
  if (itinerary) {
    if (await sendItinerary(room, itinerary)) failedItinerary = null;
    else ok = false;
  }
  endWrite(ok);
  return ok;
}

// ---------- 서버로 보내기 (묶음 D가 핀 추가·삭제·이동 시 호출) ----------
// 실패해도 조용히 false만 반환 — 로컬 저장은 호출부가 그대로 유지한다.

export async function pushPin(room: string, pin: Pin): Promise<boolean> {
  if (!room || dbConfigured === false) return false;
  beginWrite();
  const ok = await sendPin(room, pin);
  if (ok) failedPins.delete(pin.id);
  else if (!isNotConfigured()) {
    failedPins.set(pin.id, pin);
    noteFailure(room);
  }
  endWrite(ok);
  return ok;
}

async function sendPin(room: string, pin: Pin): Promise<boolean> {
  try {
    const res = await fetch("/api/pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, pin }),
    });
    const data = (await res.json()) as PushResponse;
    if (noteNotConfigured(data)) return false;
    if (!res.ok || !data.ok) return false;
    if (typeof data.updatedAt === "number") {
      ownPinWrites.set(pin.id, data.updatedAt);
    }
    return true;
  } catch {
    return false;
  }
}

export async function pushPinDelete(room: string, id: string): Promise<boolean> {
  if (!room || dbConfigured === false) return false;
  beginWrite();
  const ok = await sendPinDelete(room, id);
  failedPins.delete(id); // 지운 핀은 다시 보낼 필요가 없다
  if (ok) failedDeletes.delete(id);
  else if (!isNotConfigured()) {
    failedDeletes.add(id);
    noteFailure(room);
  }
  endWrite(ok);
  return ok;
}

async function sendPinDelete(room: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/pins?room=${encodeURIComponent(room)}&id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    const data = (await res.json()) as PushResponse;
    if (noteNotConfigured(data)) return false;
    if (!res.ok || !data.ok) return false;
    if (typeof data.updatedAt === "number") {
      ownPinWrites.set(id, data.updatedAt);
    }
    return true;
  } catch {
    return false;
  }
}

// 일정은 타이핑·드래그마다 바뀌므로 0.8초 잠잠해질 때까지 모았다가 한 번만 보낸다.
const ITINERARY_DEBOUNCE_MS = 800;
let itineraryTimer: ReturnType<typeof setTimeout> | null = null;
// 아직 서버로 안 보낸 최신 일정 — 화면을 떠날 때 마지막으로 한 번 더 보내기 위해 들고 있는다.
let pendingItinerary: { room: string; it: Itinerary } | null = null;

export function pushItinerary(room: string, it: Itinerary): void {
  if (!room || dbConfigured === false) return;
  pendingItinerary = { room, it };
  if (itineraryTimer) clearTimeout(itineraryTimer);
  itineraryTimer = setTimeout(() => {
    itineraryTimer = null;
    pendingItinerary = null;
    beginWrite();
    void sendItinerary(room, it).then((ok) => {
      if (ok) failedItinerary = null;
      else if (!isNotConfigured()) {
        failedItinerary = it;
        noteFailure(room);
      }
      endWrite(ok);
    });
  }, ITINERARY_DEBOUNCE_MS);
}

// 화면을 닫거나 다른 앱으로 넘어가는 순간, 0.8초를 못 채워 안 보낸 일정을 즉시 보낸다.
// 이걸 안 하면 적자마자 닫았을 때 서버엔 옛 사본만 남고, 다음에 열 때 그 옛 사본이
// 이 기기의 새 내용을 도로 덮어써서 "적었는데 사라지는" 일이 생긴다.
function flushPendingItinerary(): void {
  if (!itineraryTimer || !pendingItinerary) return;
  clearTimeout(itineraryTimer);
  itineraryTimer = null;
  const { room, it } = pendingItinerary;
  pendingItinerary = null;
  try {
    // sendBeacon은 화면이 닫히는 중에도 끝까지 배달되는 보내기 방법이다.
    navigator.sendBeacon(
      "/api/itinerary",
      new Blob([JSON.stringify({ room, itinerary: it })], { type: "application/json" })
    );
  } catch {
    // 못 보내도 이 기기 저장본은 남는다 — 다음 접속 때 다시 고치면 된다.
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingItinerary);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingItinerary();
  });
}

async function sendItinerary(room: string, it: Itinerary): Promise<boolean> {
  if (!room || dbConfigured === false) return false;
  try {
    const res = await fetch("/api/itinerary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, itinerary: it }),
    });
    const data = (await res.json()) as PushResponse;
    if (noteNotConfigured(data)) return false;
    if (!res.ok || !data.ok) return false;
    if (typeof data.updatedAt === "number") {
      ownItineraryWriteAt = Math.max(ownItineraryWriteAt, data.updatedAt);
    }
    return true;
  } catch {
    return false;
  }
}

// ---------- 받은 변경분을 로컬 목록에 합치기 (묶음 D가 사용) ----------

export function applyPinChanges(
  local: Pin[],
  upserts: Pin[],
  deletedIds: string[]
): Pin[] {
  const deleted = new Set(deletedIds);
  const byId = new Map(local.map((p) => [p.id, p]));
  for (const p of upserts) byId.set(p.id, p);
  for (const id of deleted) byId.delete(id);
  return [...byId.values()];
}

// ---------- 폴링 훅 ----------

export interface RoomSyncHandlers {
  // 다른 사람이 바꾼 핀(추가·수정)과 지운 핀 id 목록. 메아리는 이미 걸러져 있다.
  onPinChanges: (upserts: Pin[], deletedIds: string[]) => void;
  // 다른 사람이 바꾼 일정. 넘어오면 통째로 교체하면 된다.
  onItinerary?: (it: Itinerary) => void;
}

export interface RoomSyncState {
  // DB가 붙어 있어 함께 편집이 되는지. 처음엔 true(하이드레이션 안전),
  // 서버가 "DB 미설정"이라고 알려주면 false로 바뀐다 — 안내 배너용.
  enabled: boolean;
}

export function useRoomSync(room: string, handlers: RoomSyncHandlers): RoomSyncState {
  // 첫 화면(서버 렌더 포함)에선 아직 모르니 true로 시작 — 하이드레이션 안전.
  // 이 세션에서 이미 "미설정"으로 판명났으면 처음부터 false.
  const [enabled, setEnabled] = useState(() => dbConfigured !== false);
  // 핸들러는 ref로 들고 있어 렌더마다 폴링이 재시작되지 않게 한다.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (dbConfigured === false || !room) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polling = false;
    let since = 0; // 서버 시각(밀리초). 0이면 처음이라 전부 받는다.
    let lastItineraryAt = 0;
    let errorCount = 0;

    const schedule = (ms: number) => {
      if (stopped || document.visibilityState !== "visible") return;
      timer = setTimeout(poll, ms);
    };

    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        const [pinsRes, itRes] = await Promise.all([
          fetch(`/api/pins?room=${encodeURIComponent(room)}&since=${since}`),
          fetch(`/api/itinerary?room=${encodeURIComponent(room)}`),
        ]);
        const pinsData = (await pinsRes.json()) as PinsPollResponse;
        const itData = (await itRes.json()) as ItineraryPollResponse;

        // DB 미설정이거나 구버전 API(serverNow 없음)면 폴링을 완전히 멈춘다.
        if (
          pinsData.configured === false ||
          typeof pinsData.serverNow !== "number"
        ) {
          dbConfigured = false;
          stopped = true;
          setEnabled(false);
          return;
        }
        dbConfigured = true;
        errorCount = 0;

        const changes = Array.isArray(pinsData.pins) ? pinsData.pins : [];
        const upserts: Pin[] = [];
        const deletedIds: string[] = [];
        for (const p of changes) {
          // 내가 보낸 변경의 메아리(내 기록 시각 이상)는 무시 — updatedAt 큰 쪽이 이긴다.
          const mine = ownPinWrites.get(p.id);
          if (mine !== undefined && mine >= p.updatedAt) continue;
          if (p.deleted) deletedIds.push(p.id);
          else upserts.push(p);
        }
        if (upserts.length > 0 || deletedIds.length > 0) {
          handlersRef.current.onPinChanges(upserts, deletedIds);
        }

        if (
          itData.ok &&
          itData.itinerary &&
          typeof itData.updatedAt === "number" &&
          itData.updatedAt > lastItineraryAt
        ) {
          lastItineraryAt = itData.updatedAt;
          // 내가 방금 고친 게 아직 서버로 안 간 상태(0.8초 모으는 중)면 서버의 옛 사본으로
          // 지금 화면을 덮어쓰지 않는다 — 곧 내 새 내용이 서버로 가서 어차피 이긴다.
          if (itData.updatedAt > ownItineraryWriteAt && itineraryTimer === null) {
            handlersRef.current.onItinerary?.(itData.itinerary);
          }
        }

        since = pinsData.serverNow;
      } catch {
        // 네트워크 오류 — 연달아 실패하면 간격을 조금씩 늘린다(최대 30초).
        errorCount += 1;
      } finally {
        polling = false;
        if (!stopped) {
          const delay = Math.min(POLL_MS * 2 ** errorCount, MAX_BACKOFF_MS);
          schedule(delay);
        }
      }
    };

    // 다른 탭을 보고 있으면 폴링을 멈추고, 돌아오면 즉시 한 번 확인한다.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        timer = null;
        void poll();
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    void poll();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [room]);

  return { enabled };
}
