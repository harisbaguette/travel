import type { Pin } from "@/lib/types";
import { getServerSupabase } from "@/lib/supabaseServer";

// 핀 CRUD — Supabase 테이블 pins.
// 스키마(SQL, Supabase 대시보드에서 실행):
//   create table pins (
//     id text primary key,
//     room_id text not null,
//     lat double precision not null,
//     lng double precision not null,
//     type text not null,
//     name text not null,
//     memo text default '',
//     emoji text default '',
//     is_ai boolean default false,
//     created_at bigint not null,
//     created_by text default ''
//   );
//   create index pins_room_idx on pins(room_id);
//   alter table pins enable row level security;
//   create policy "anyone can read/write" on pins for all using (true) with check (true);

interface PinRow {
  id: string;
  room_id: string;
  lat: number;
  lng: number;
  type: string;
  name: string;
  memo: string;
  emoji: string;
  is_ai: boolean;
  created_at: number;
  created_by: string;
}

function rowToPin(r: PinRow): Pin {
  return {
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    type: r.type as Pin["type"],
    name: r.name,
    memo: r.memo ?? "",
    emoji: r.emoji ?? "",
    isAI: Boolean(r.is_ai),
    createdAt: r.created_at,
    createdBy: r.created_by || undefined,
  };
}

function pinToRow(roomId: string, p: Pin): PinRow {
  return {
    id: p.id,
    room_id: roomId,
    lat: p.lat,
    lng: p.lng,
    type: p.type,
    name: p.name,
    memo: p.memo,
    emoji: p.emoji,
    is_ai: p.isAI,
    created_at: p.createdAt,
    created_by: p.createdBy ?? "",
  };
}

// GET /api/pins?room=roomId
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const room = url.searchParams.get("room") ?? "";
  const supabase = getServerSupabase();
  if (!supabase) return Response.json({ ok: true, pins: [] });
  try {
    const { data, error } = await supabase
      .from("pins")
      .select("*")
      .eq("room_id", room)
      .order("created_at", { ascending: true });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    const pins = (data ?? []).map(rowToPin);
    return Response.json({ ok: true, pins });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// POST /api/pins — body: { room, pin }
export async function POST(request: Request): Promise<Response> {
  const supabase = getServerSupabase();
  if (!supabase) return Response.json({ ok: false, error: "Supabase 미설정" }, { status: 503 });
  let body: { room?: string; pin?: Pin };
  try {
    body = (await request.json()) as { room?: string; pin?: Pin };
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const { room, pin } = body;
  if (!room || !pin || !pin.id) {
    return Response.json({ ok: false, error: "필수 값 누락" }, { status: 400 });
  }
  try {
    const { error } = await supabase
      .from("pins")
      .upsert(pinToRow(room, pin));
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// DELETE /api/pins?room=roomId&id=pinId
export async function DELETE(request: Request): Promise<Response> {
  const supabase = getServerSupabase();
  if (!supabase) return Response.json({ ok: false, error: "Supabase 미설정" }, { status: 503 });
  const url = new URL(request.url);
  const room = url.searchParams.get("room") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!room || !id) return Response.json({ ok: false, error: "필수 값 누락" }, { status: 400 });
  try {
    const { error } = await supabase
      .from("pins")
      .delete()
      .eq("room_id", room)
      .eq("id", id);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}