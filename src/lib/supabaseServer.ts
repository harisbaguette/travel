import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 서버 라우트용 Supabase 클라이언트 — env 없으면 null.
// 클라이언트용 supabase.ts와 분리한 이유: "use client" 지시어 충돌 방지.
let cached: SupabaseClient | null | undefined;

export function getServerSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key || url === "YOUR_SUPABASE_URL" || key === "YOUR_SUPABASE_ANON_KEY") {
    cached = null;
    return null;
  }
  try {
    cached = createClient(url, key);
    return cached;
  } catch {
    cached = null;
    return null;
  }
}