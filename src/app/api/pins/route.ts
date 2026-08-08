import type { Pin, PinSource } from "@/lib/types";
import { getDb } from "@/lib/db";

// 핀 CRUD — Neon(Postgres) pins 테이블. 스키마: src/lib/schema.sql
//
// 응답 규격은 src/lib/sync.ts 상단 주석과 한 몸이다:
//   GET    ?room=&since=   → { ok, configured, serverNow, pins: [{...pin, updatedAt, deleted}] }
//   POST   {room, pin}     → { ok, updatedAt }
//   DELETE ?room=&id=      → { ok, updatedAt }
// DB 미설정이면 오류 대신 configured:false — 앱은 혼자 쓰기 모드로 조용히 동작한다.

const PIN_TYPES = new Set(["food", "spot", "cafe", "stay", "etc"]);

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
  created_at: number | string;
  created_by: string;
  deleted: boolean;
  sources: unknown; // jsonb — [{title, url}]
  address: string;
  updated_ms: number | string; // extract(epoch from updated_at) * 1000
}

// 추천 근거 링크 정리 — 배열 3개까지, 제목 200자·주소 500자까지,
// 주소는 http(s)로 시작하는 것만. 어긋나는 항목만 골라 버린다.
const MAX_SOURCES = 3;

function cleanSources(value: unknown): PinSource[] {
  if (!Array.isArray(value)) return [];
  const out: PinSource[] = [];
  for (const raw of value) {
    if (out.length >= MAX_SOURCES) break;
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    if (typeof s.title !== "string" || s.title.length === 0 || s.title.length > 200) continue;
    if (typeof s.url !== "string" || s.url.length === 0 || s.url.length > 500) continue;
    if (!/^https?:\/\//i.test(s.url)) continue;
    out.push({ title: s.title, url: s.url });
  }
  return out;
}

function rowToPin(r: PinRow): Pin & { updatedAt: number; deleted: boolean } {
  return {
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    type: r.type as Pin["type"],
    name: r.name,
    memo: r.memo ?? "",
    emoji: r.emoji ?? "",
    isAI: Boolean(r.is_ai),
    createdAt: Number(r.created_at),
    // 예전 데이터에 created_by='AI'로 저장된 핀이 남아 있다 — 사람이 아니므로
    // 주인 없음으로 취급해야 모든 기기에서 "친구 핀"(회색 점선)으로 오인되지 않는다.
    createdBy: !r.created_by || r.created_by === "AI" ? undefined : r.created_by,
    sources: cleanSources(r.sources),
    address: typeof r.address === "string" ? r.address : "",
    updatedAt: Math.round(Number(r.updated_ms)),
    deleted: Boolean(r.deleted),
  };
}

// 입력값 검증 — 아무 값이나 DB에 들어오지 못하게 막는다.
function validRoom(room: unknown): room is string {
  return typeof room === "string" && room.length > 0 && room.length <= 100;
}

function validPin(pin: unknown): pin is Pin {
  if (!pin || typeof pin !== "object") return false;
  const p = pin as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    p.id.length > 0 &&
    p.id.length <= 100 &&
    typeof p.lat === "number" &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    typeof p.lng === "number" &&
    p.lng >= -180 &&
    p.lng <= 180 &&
    typeof p.type === "string" &&
    PIN_TYPES.has(p.type) &&
    typeof p.name === "string" &&
    p.name.length > 0 &&
    p.name.length <= 200 &&
    (p.memo === undefined || (typeof p.memo === "string" && p.memo.length <= 2000)) &&
    (p.emoji === undefined || (typeof p.emoji === "string" && p.emoji.length <= 8)) &&
    (p.createdBy === undefined || (typeof p.createdBy === "string" && p.createdBy.length <= 100)) &&
    // 근거 링크는 배열이기만 하면 받고, 항목별 어긋남은 cleanSources가 골라 버린다.
    (p.sources === undefined || Array.isArray(p.sources)) &&
    (p.address === undefined || (typeof p.address === "string" && p.address.length <= 300))
  );
}

// GET /api/pins?room=&since= — since(밀리초) 이후 바뀐 것만 + 서버 시각 동봉
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const room = url.searchParams.get("room") ?? "";
  const since = Number(url.searchParams.get("since") ?? "0");
  const sql = getDb();
  if (!sql) return Response.json({ ok: true, configured: false, pins: [] });
  if (!validRoom(room)) {
    return Response.json({ ok: false, error: "방 이름이 올바르지 않아요" }, { status: 400 });
  }
  const sinceMs = Number.isFinite(since) && since > 0 ? since : 0;
  try {
    const rows = (await sql`
      select id, room_id, lat, lng, type, name, memo, emoji, is_ai,
             created_at, created_by, deleted, sources, address,
             extract(epoch from updated_at) * 1000 as updated_ms,
             extract(epoch from now()) * 1000 as server_now
      from pins
      where room_id = ${room}
        and updated_at > to_timestamp(${sinceMs} / 1000.0)
      order by updated_at asc
    `) as (PinRow & { server_now: number | string })[];
    // 바뀐 게 없어도 서버 시각은 알려줘야 다음 폴링 기준이 잡힌다.
    let serverNow = rows.length > 0 ? Math.round(Number(rows[0].server_now)) : 0;
    if (!serverNow) {
      const t = (await sql`select extract(epoch from now()) * 1000 as server_now`) as {
        server_now: number | string;
      }[];
      serverNow = Math.round(Number(t[0].server_now));
    }
    return Response.json({
      ok: true,
      configured: true,
      serverNow,
      pins: rows.map(rowToPin),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// POST /api/pins — body: { room, pin } (핀 1개 upsert)
export async function POST(request: Request): Promise<Response> {
  const sql = getDb();
  if (!sql) return Response.json({ ok: false, configured: false });
  let body: { room?: unknown; pin?: unknown };
  try {
    body = (await request.json()) as { room?: unknown; pin?: unknown };
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  if (!validRoom(body.room) || !validPin(body.pin)) {
    return Response.json({ ok: false, error: "입력값이 올바르지 않아요" }, { status: 400 });
  }
  const room = body.room;
  const p = body.pin;
  try {
    const rows = (await sql`
      insert into pins (id, room_id, lat, lng, type, name, memo, emoji, is_ai, created_at, created_by, deleted, sources, address)
      values (${p.id}, ${room}, ${p.lat}, ${p.lng}, ${p.type}, ${p.name},
              ${p.memo ?? ""}, ${p.emoji ?? ""}, ${Boolean(p.isAI)},
              ${Number(p.createdAt) || Date.now()}, ${p.createdBy === "AI" ? "" : p.createdBy ?? ""}, false,
              ${JSON.stringify(cleanSources(p.sources))}::jsonb, ${typeof p.address === "string" ? p.address.slice(0, 300) : ""})
      on conflict (id) do update set
        lat = excluded.lat, lng = excluded.lng, type = excluded.type,
        name = excluded.name, memo = excluded.memo, emoji = excluded.emoji,
        sources = excluded.sources, address = excluded.address,
        deleted = false, updated_at = now()
      returning extract(epoch from updated_at) * 1000 as updated_ms
    `) as { updated_ms: number | string }[];
    return Response.json({ ok: true, updatedAt: Math.round(Number(rows[0].updated_ms)) });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// DELETE /api/pins?room=&id= — 행은 남기고 deleted 표시만 한다.
// 그래야 다른 창이 "이 핀은 지워졌다"를 폴링으로 알 수 있다.
export async function DELETE(request: Request): Promise<Response> {
  const sql = getDb();
  if (!sql) return Response.json({ ok: false, configured: false });
  const url = new URL(request.url);
  const room = url.searchParams.get("room") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!validRoom(room) || !id || id.length > 100) {
    return Response.json({ ok: false, error: "입력값이 올바르지 않아요" }, { status: 400 });
  }
  try {
    const rows = (await sql`
      update pins set deleted = true, updated_at = now()
      where room_id = ${room} and id = ${id}
      returning extract(epoch from updated_at) * 1000 as updated_ms
    `) as { updated_ms: number | string }[];
    const updatedAt =
      rows.length > 0 ? Math.round(Number(rows[0].updated_ms)) : Date.now();
    return Response.json({ ok: true, updatedAt });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
