"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase 클라이언트 — env 없으면 null 반환 (graceful fallback).
// 이 파일은 "use client" — 브라우저에서만 동작. 서버 라우트에서는 직접 createClient.
let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  // 빈 문자열/placeholder도 미설정으로 간주
  if (!url || !key || url === "YOUR_SUPABASE_URL" || key === "YOUR_SUPABASE_ANON_KEY") {
    cached = null;
    return null;
  }
  try {
    cached = createClient(url, key, {
      realtime: { params: { eventsPerSecond: 5 } },
    });
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}