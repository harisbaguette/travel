import type { Itinerary } from "@/lib/types";
import { getServerSupabase } from "@/lib/supabaseServer";

// 일정 영속화 — Supabase 테이블 itineraries.
// 스키마(SQL):
//   create table itineraries (
//     room_id text primary key,
//     data jsonb not null,
//     updated_at timestamptz default now()
//   );
//   alter table itineraries enable row level security;
//   create policy "anyone can read/write" on itineraries for all using (true) with check (true);

// GET /api/itinerary?room=roomId
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const room = url.searchParams.get("room") ?? "";
  const supabase = getServerSupabase();
  if (!supabase) return Response.json({ ok: true, itinerary: null });
  try {
    const { data, error } = await supabase
      .from("itineraries")
      .select("data")
      .eq("room_id", room)
      .maybeSingle();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, itinerary: (data?.data as Itinerary) ?? null });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// POST /api/itinerary — body: { room, itinerary }
export async function POST(request: Request): Promise<Response> {
  const supabase = getServerSupabase();
  if (!supabase) return Response.json({ ok: false, error: "Supabase 미설정" }, { status: 503 });
  let body: { room?: string; itinerary?: Itinerary };
  try {
    body = (await request.json()) as { room?: string; itinerary?: Itinerary };
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const { room, itinerary } = body;
  if (!room || !itinerary) {
    return Response.json({ ok: false, error: "필수 값 누락" }, { status: 400 });
  }
  try {
    const { error } = await supabase
      .from("itineraries")
      .upsert(
        { room_id: room, data: itinerary, updated_at: new Date().toISOString() },
        { onConflict: "room_id" }
      );
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}