import { getDb } from "@/lib/db";

// 일정 저장 — Neon(Postgres) itineraries 테이블. 방 하나에 일정 하나, 통째로 저장.
//   GET  ?room=            → { ok, configured, itinerary, updatedAt }
//   POST {room, itinerary} → { ok, updatedAt }

function validRoom(room: unknown): room is string {
  return typeof room === "string" && room.length > 0 && room.length <= 100;
}

// 일정 모양 검증 — 필수 뼈대만 확인하고 크기 상한(200KB)을 둔다.
function validItinerary(it: unknown): boolean {
  if (!it || typeof it !== "object") return false;
  const o = it as Record<string, unknown>;
  if (typeof o.startDate !== "string" || typeof o.endDate !== "string") return false;
  if (!Array.isArray(o.days)) return false;
  try {
    return JSON.stringify(it).length <= 200_000;
  } catch {
    return false;
  }
}

// GET /api/itinerary?room=
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const room = url.searchParams.get("room") ?? "";
  const sql = getDb();
  if (!sql) return Response.json({ ok: true, configured: false, itinerary: null });
  if (!validRoom(room)) {
    return Response.json({ ok: false, error: "방 이름이 올바르지 않아요" }, { status: 400 });
  }
  try {
    const rows = (await sql`
      select data, extract(epoch from updated_at) * 1000 as updated_ms
      from itineraries where room_id = ${room}
    `) as { data: unknown; updated_ms: number | string }[];
    if (rows.length === 0) {
      return Response.json({ ok: true, configured: true, itinerary: null });
    }
    return Response.json({
      ok: true,
      configured: true,
      itinerary: rows[0].data,
      updatedAt: Math.round(Number(rows[0].updated_ms)),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// POST /api/itinerary — body: { room, itinerary }
export async function POST(request: Request): Promise<Response> {
  const sql = getDb();
  if (!sql) return Response.json({ ok: false, configured: false });
  let body: { room?: unknown; itinerary?: unknown };
  try {
    body = (await request.json()) as { room?: unknown; itinerary?: unknown };
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  if (!validRoom(body.room) || !validItinerary(body.itinerary)) {
    return Response.json({ ok: false, error: "입력값이 올바르지 않아요" }, { status: 400 });
  }
  try {
    const rows = (await sql`
      insert into itineraries (room_id, data)
      values (${body.room}, ${JSON.stringify(body.itinerary)}::jsonb)
      on conflict (room_id) do update set
        data = excluded.data, updated_at = now()
      returning extract(epoch from updated_at) * 1000 as updated_ms
    `) as { updated_ms: number | string }[];
    return Response.json({ ok: true, updatedAt: Math.round(Number(rows[0].updated_ms)) });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
