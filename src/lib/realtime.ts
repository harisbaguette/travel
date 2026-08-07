"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type { Itinerary, Pin } from "./types";

// 실시간 동기화 — Supabase Realtime broadcast channel 사용.
// 테이블 설정 없이도 채널만 있으면 동작. Supabase 미설정이면 null 반환(호출부에서 localStorage 폴백).
//
// 채널명 규칙: room:{roomId}
// 이벤트: pins-upsert(핀 전체 교체), itinerary-upsert(일정 전체 교체)
// simplify: 첫 버전은 전체 교체 방식. diff 기반 증분 동기화는 나중.

export interface RealtimeHandlers {
  onPins?: (pins: Pin[]) => void;
  onItinerary?: (it: Itinerary) => void;
}

export function subscribeToRoom(
  roomId: string,
  handlers: RealtimeHandlers
): () => void {
  const supabase = getSupabase();
  if (!supabase || !roomId) return () => {};

  let channel: RealtimeChannel;
  try {
    channel = supabase
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "pins-upsert" }, (message) => {
        const pins = message?.payload as Pin[] | undefined;
        if (Array.isArray(pins)) handlers.onPins?.(pins);
      })
      .on("broadcast", { event: "itinerary-upsert" }, (message) => {
        const it = message?.payload as Itinerary | undefined;
        if (it && typeof it === "object") handlers.onItinerary?.(it);
      })
      .subscribe();
  } catch {
    return () => {};
  }

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // ignore
    }
  };
}

export function broadcastPins(roomId: string, pins: Pin[]): void {
  const supabase = getSupabase();
  if (!supabase || !roomId) return;
  try {
    void supabase.channel(`room:${roomId}`).send({
      type: "broadcast",
      event: "pins-upsert",
      payload: pins,
    });
  } catch {
    // ignore — 폴백은 호출부에서 localStorage로 처리
  }
}

export function broadcastItinerary(roomId: string, it: Itinerary): void {
  const supabase = getSupabase();
  if (!supabase || !roomId) return;
  try {
    void supabase.channel(`room:${roomId}`).send({
      type: "broadcast",
      event: "itinerary-upsert",
      payload: it,
    });
  } catch {
    // ignore
  }
}