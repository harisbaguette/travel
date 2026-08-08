import Anthropic from "@anthropic-ai/sdk";
import type { Pin, PinType } from "@/lib/types";

// 비서 API — 사용자가 채팅으로 부탁하면 AI가 웹에서 조사하고,
// 장소 사전(Photon)으로 좌표를 확인한 뒤, 핀 후보 목록을 만들어 돌려준다.
// 후보는 바로 꽂히지 않고 클라이언트의 고르기 시트에서 사용자가 선택한다.
// AI 접속 정보는 SDK가 실행 환경에서 알아서 찾는다(.env.example 참고).

const MODEL = "claude-opus-5";
const MAX_TURNS = 8; // 도구 호출 왕복 상한 — 무한 반복 방지
const MAX_PINS = 10;

// Vercel 함수 실행 상한(초) — 웹 검색 + 좌표 확인 왕복 여유
export const maxDuration = 60;

// 핀 타입별 이모지 — pinTypes.ts와 같은 값(그 파일은 lucide 아이콘을 끌고 와서 서버에선 따로 둠)
const PIN_EMOJI: Record<PinType, string> = {
  food: "🍜",
  spot: "📸",
  cafe: "☕",
  stay: "🛏",
  etc: "📍",
};
const PIN_TYPE_VALUES = ["food", "spot", "cafe", "stay", "etc"] as const;

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

interface AssistantContext {
  room?: string;
  center?: { lat: number; lng: number };
  pinNames?: string[];
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    city?: string;
    country?: string;
    street?: string;
  };
}

// 장소 이름 → 좌표 찾기(Photon, OpenStreetMap 기반 무료 장소 사전)
async function geocode(
  query: string,
  near?: { lat: number; lng: number }
): Promise<{ name: string; lat: number; lng: number; address: string }[]> {
  const params = new URLSearchParams({ q: query, limit: "5", lang: "default" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const out: { name: string; lat: number; lng: number; address: string }[] = [];
  for (const f of data.features ?? []) {
    const coord = f.geometry?.coordinates;
    const name = f.properties?.name;
    if (!coord || !name) continue;
    const address = [f.properties?.street, f.properties?.city, f.properties?.country]
      .filter(Boolean)
      .join(", ");
    out.push({ name, lat: coord[1], lng: coord[0], address });
  }
  return out;
}

function buildSystem(context: AssistantContext): string {
  const lines = [
    "당신은 여행 핀지도 앱의 비서입니다. 사용자가 맛집·관광지·카페·숙소 등을 찾아 달라고 하면:",
    "1. web_search 도구로 최신 정보를 조사하고(평점·후기 좋은 곳 위주),",
    "2. find_place 도구로 각 장소의 실제 좌표를 확인한 뒤,",
    "3. propose_pins 도구로 후보 목록을 한 번에 제출하세요.",
    "좌표를 확인하지 못한 장소는 목록에 넣지 마세요. 후보는 3~8곳이 적당합니다.",
    "memo에는 왜 추천하는지 한 줄(예: 현지인 인기 쌀국수집)을 적으세요.",
    "장소 추천이 아닌 일반 질문에는 도구 없이 한국어로 짧게 답하세요.",
    "최종 답변은 한국어로, 2~4문장으로 짧게. 목록 나열은 시트에서 보여주므로 반복하지 마세요.",
  ];
  if (context.room) lines.push(`현재 여행 이름: ${context.room}`);
  if (context.center)
    lines.push(
      `지금 보고 있는 지도 중심 좌표: ${context.center.lat.toFixed(4)}, ${context.center.lng.toFixed(4)} — 별도 지역 언급이 없으면 이 근처를 기준으로 하세요.`
    );
  if (context.pinNames && context.pinNames.length > 0)
    lines.push(`이미 지도에 꽂힌 핀(중복 추천 금지): ${context.pinNames.join(", ")}`);
  return lines.join("\n");
}

const TOOLS: Anthropic.Messages.ToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 3 },
  {
    name: "find_place",
    description:
      "장소 이름으로 실제 좌표(위도·경도)를 찾는다. 웹 검색으로 알아낸 가게·명소 이름을 넣으면 후보 좌표 목록을 돌려준다. 도시 이름을 함께 넣으면 정확도가 올라간다(예: 'Pho Thin Hanoi').",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "장소 이름(가능하면 영문 + 도시명)" },
        near_lat: { type: "number", description: "우선순위를 줄 기준 위도(선택)" },
        near_lng: { type: "number", description: "우선순위를 줄 기준 경도(선택)" },
      },
      required: ["query"],
    },
  },
  {
    name: "propose_pins",
    description:
      "확정한 추천 장소 목록을 앱에 제출한다. 사용자에게 고르기 시트로 보여지므로 마지막에 한 번만 호출한다. 좌표는 반드시 find_place로 확인한 값을 쓴다.",
    input_schema: {
      type: "object" as const,
      properties: {
        pins: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "장소 이름(한국어 병기 가능)" },
              lat: { type: "number" },
              lng: { type: "number" },
              type: { type: "string", enum: [...PIN_TYPE_VALUES] },
              memo: { type: "string", description: "추천 이유 한 줄" },
            },
            required: ["name", "lat", "lng", "type"],
          },
        },
      },
      required: ["pins"],
    },
  },
];

interface ProposedPin {
  name: string;
  lat: number;
  lng: number;
  type: string;
  memo?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: { messages?: ChatTurn[]; context?: AssistantContext };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "요청 형식이 잘못되었어요." }, { status: 400 });
  }

  const turns = (body.messages ?? []).filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string"
  );
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return Response.json({ ok: false, error: "질문이 비어 있어요." }, { status: 400 });
  }
  const context = body.context ?? {};

  // 요청이 길어지지 않게 최근 12개 발화만 보낸다
  const messages: Anthropic.MessageParam[] = turns.slice(-12).map((m) => ({
    role: m.role,
    content: m.text,
  }));

  // 접속 정보는 실행 환경에서 SDK가 스스로 찾는다 — 코드에 키를 두지 않는다.
  // 아무 설정도 없으면 만들다가 바로 실패하므로 여기서 친절하게 알려준다.
  let client: Anthropic;
  try {
    client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  } catch {
    return Response.json(
      {
        ok: false,
        error:
          "AI 접속 정보가 아직 없어요 — 서버에 AI 접속 설정(.env.example 참고)을 넣어야 비서가 일할 수 있어요.",
      },
      { status: 503 }
    );
  }

  let reply = "";
  const proposed: ProposedPin[] = [];

  try {
    for (let i = 0; i < MAX_TURNS; i++) {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: buildSystem(context),
        tools: TOOLS,
        messages,
      });

      if (res.stop_reason === "pause_turn") {
        // 서버 도구(웹 검색)가 이어서 돌 수 있게 그대로 되보낸다
        messages.push({ role: "assistant", content: res.content });
        continue;
      }

      if (res.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: res.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of res.content) {
          if (block.type !== "tool_use") continue;
          if (block.name === "find_place") {
            const input = block.input as {
              query?: string;
              near_lat?: number;
              near_lng?: number;
            };
            let found: Awaited<ReturnType<typeof geocode>> = [];
            try {
              found = await geocode(
                input.query ?? "",
                typeof input.near_lat === "number" && typeof input.near_lng === "number"
                  ? { lat: input.near_lat, lng: input.near_lng }
                  : context.center
              );
            } catch {
              // 장소 사전이 응답하지 않으면 빈 목록으로 알려준다
            }
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content:
                found.length > 0
                  ? JSON.stringify(found)
                  : "좌표를 찾지 못했어요. 다른 표기(영문 등)로 다시 시도해 보세요.",
            });
          } else if (block.name === "propose_pins") {
            const input = block.input as { pins?: ProposedPin[] };
            for (const p of input.pins ?? []) {
              if (
                typeof p?.name === "string" &&
                Number.isFinite(p?.lat) &&
                Number.isFinite(p?.lng) &&
                proposed.length < MAX_PINS
              ) {
                proposed.push(p);
              }
            }
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `${input.pins?.length ?? 0}곳이 등록되었어요. 사용자에게 짧게 안내하고 마치세요.`,
            });
          }
        }
        if (results.length > 0) messages.push({ role: "user", content: results });
        continue;
      }

      // end_turn·refusal 등 — 글 블록만 모아 답으로 삼는다
      reply = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json(
        {
          ok: false,
          error:
            "AI 접속 정보가 아직 없어요 — 서버에 AI 접속 설정(.env.example 참고)을 넣어야 비서가 일할 수 있어요.",
        },
        { status: 503 }
      );
    }
    const msg =
      err instanceof Anthropic.APIError
        ? `AI 응답에 실패했어요 (${err.status ?? "네트워크"}). 잠시 뒤 다시 시도해 주세요.`
        : "AI 응답 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.";
    return Response.json({ ok: false, error: msg }, { status: 502 });
  }

  if (!reply && proposed.length === 0) {
    return Response.json(
      { ok: false, error: "시간 안에 답을 만들지 못했어요. 질문을 조금 좁혀서 다시 물어봐 주세요." },
      { status: 504 }
    );
  }

  const now = Date.now();
  const pins: Pin[] = proposed.map((p, idx) => {
    const type: PinType = (PIN_TYPE_VALUES as readonly string[]).includes(p.type)
      ? (p.type as PinType)
      : "etc";
    return {
      id: `ai-${now}-${idx}`,
      lat: p.lat,
      lng: p.lng,
      type,
      name: p.name,
      memo: p.memo ?? "",
      emoji: PIN_EMOJI[type],
      isAI: true,
      createdAt: now + idx,
    };
  });

  return Response.json({
    ok: true,
    reply: reply || (pins.length > 0 ? `${pins.length}곳을 찾았어요 — 골라서 꽂아 보세요.` : ""),
    pins,
  });
}
