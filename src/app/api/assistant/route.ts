import type { Pin, PinSource, PinType } from "@/lib/types";
import { searchNaverBlog, searchNaverLocal, type NaverBlogItem } from "@/lib/naver";

// 비서 API — 사용자가 채팅으로 부탁하면 AI가 네이버 블로그 후기를 뒤져 장소를 고르고,
// 좌표를 확인한 뒤 핀 후보 목록을 만들어 돌려준다.
// 후보는 바로 꽂히지 않고 클라이언트의 고르기 시트에서 사용자가 선택한다.
// AI는 DeepSeek을 쓴다(OpenAI와 같은 형식이라 별도 꾸러미 없이 fetch로 부른다).

// 열쇠는 두 갈래로 받는다. 딥시크에서 바로 받은 열쇠면 딥시크로, OpenRouter(여러 AI를 한 열쇠로
// 골라 쓰는 중개소)에서 받은 열쇠(sk-or- 로 시작)면 중개소로 보낸다. 둘 다 부르는 방식은 같다.
const DIRECT_URL = "https://api.deepseek.com/chat/completions";
const DIRECT_MODEL = "deepseek-v4-flash";
const ROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ROUTER_MODEL = "deepseek/deepseek-v4-flash-0731"; // 2026-07-31 정식판
const MAX_TURNS = 6; // 도구 호출 왕복 상한 — 무한 반복 방지
const MAX_PINS = 10;
const MAX_SOURCES_PER_PIN = 3;
const MAX_REPLY_SOURCES = 6;
const CALL_TIMEOUT_MS = 30_000;
const TOTAL_BUDGET_MS = 50_000;

// Vercel 함수 실행 상한(초) — 검색 + 좌표 확인 왕복 여유
export const maxDuration = 60;

const NO_AI_KEY =
  "AI 접속 정보가 아직 없어요 — 서버에 DEEPSEEK_API_KEY나 OPENROUTER_API_KEY 중 하나를 넣어야 비서가 일할 수 있어요(.env.example 참고).";
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

// 장소 이름 → 좌표 찾기 ②: 같은 서버의 장소 창구에 물어본다(열쇠 없이 구글 지도 화면을 읽는 길).
// 세계 장소 사전이 모르는 작은 가게를 여기서 건지는 경우가 많다.
async function geocodeByPlaceApi(
  query: string,
  base: string
): Promise<{ name: string; lat: number; lng: number; address: string }[]> {
  const url = new URL(`/api/search-place?q=${encodeURIComponent(query)}`, base);
  const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: { name?: string; lat?: number; lng?: number; address?: string }[];
  };
  const out: { name: string; lat: number; lng: number; address: string }[] = [];
  for (const r of data.results ?? []) {
    if (!r?.name || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    out.push({
      name: r.name,
      lat: r.lat as number,
      lng: r.lng as number,
      address: typeof r.address === "string" ? r.address : "",
    });
  }
  return out;
}

// 좌표 → 주소: 그 지점이 무슨 주소인지 거꾸로 물어본다.
// 가게 이름으로는 주소가 안 나오는 경우가 많아, 자리를 정한 뒤 여기서 주소를 채운다.
async function reverseAddress(lat: number, lng: number): Promise<string> {
  const res = await fetch(
    `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=default&limit=1`,
    { signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) return "";
  const data = (await res.json()) as {
    features?: { properties?: Record<string, unknown> }[];
  };
  const p = data.features?.[0]?.properties;
  if (!p) return "";
  // 나라마다 칸 이름이 달라서 넓게 훑고, 같은 말이 두 번 들어가지 않게 걸러 붙인다.
  const parts: string[] = [];
  for (const key of ["state", "county", "city", "district", "locality", "street", "housenumber"]) {
    const v = p[key];
    if (typeof v === "string" && v.trim() && !parts.includes(v.trim())) parts.push(v.trim());
  }
  return parts.join(" ").trim();
}

function buildSystem(context: AssistantContext): string {
  const lines = [
    "당신은 여행 핀지도 앱의 비서입니다. 사용자가 맛집·관광지·카페·숙소를 찾아 달라고 하면 이 순서로 일합니다.",
    "1. naver_blog_search 로 사람들이 쓴 후기를 찾는다. 한 번으로 끝내지 말고 검색어를 바꿔 2~4번 찾아, 여러 글을 겹쳐 보고 고른다.",
    "2. propose_pins 로 후보 목록을 한 번에 제출한다.",
    "웹 조사는 naver_blog_search 로만 합니다.",
    "지역 규칙(가장 중요): 사용자가 말한 지역·도시가 무조건 우선입니다. 검색어와 area 칸에는 사용자가 말한 지역 이름을 그대로 넣으세요. 사용자가 '다낭'이라고 하면 다낭만 찾습니다.",
    "조사 품질 규칙:",
    "- 검색어를 다르게 두세 가지로 만들어 한 차례에 같이 시키세요(예: '○○ 맛집 추천', '○○ 현지인 맛집 후기', '○○ 가볼만한 곳'). 하나씩 차례로 물으면 시간이 모자랍니다.",
    "- 서로 다른 글 두 곳 이상에서 나온 가게를 먼저 고르세요. 한 글에만 나온 곳은 그 글이 자세할 때만 넣습니다.",
    "- sponsored: true 인 글은 돈이나 물건을 받고 쓴 글입니다. 그런 글만 근거인 가게는 넣지 마세요.",
    "- postdate(올린 날짜)가 오래된 글보다 최근 글을 믿으세요. 문 닫았을 수 있는 곳은 recent: true 로 한 번 더 확인하세요.",
    "- 후기에 이름만 스쳐 지나가는 곳은 빼고, 실제로 다녀와서 쓴 티가 나는 곳만 고르세요.",
    "- 같은 가게의 다른 지점을 섞지 말고, 후기에 나온 지점 이름을 그대로 쓰세요.",
    "가게 좌표는 앱이 직접 찾으니 지어내지 마세요. 대신 area 에 지역 이름을, area_lat/area_lng 에 그 지역(도시·동네) 중심의 대략적인 좌표를 적으세요. 예: 다낭 16.05/108.21, 방콕 13.75/100.50, 서울 성수동 37.544/127.056. 이 값은 앱이 '가게가 그 동네에 있는지' 재는 잣대로만 씁니다.",
    "memo에는 블로그 후기에서 본 내용을 근거로 추천 이유를 한 줄 적으세요(예: 후기에서 육수가 진하다고 칭찬한 국밥집).",
    "sources에는 반드시 naver_blog_search 결과로 받은 링크만 그대로 붙여 넣으세요. 링크나 제목을 지어내면 그 후보는 버려집니다.",
    "출처가 없는 장소는 제출하지 마세요. 후보는 3~8곳이 적당합니다.",
    "장소 추천이 아닌 일반 질문에는 도구 없이 한국어로 짧게 답하세요.",
    "최종 답변은 한국어로 2~4문장. 목록 나열은 앱 화면에서 보여 주므로 반복하지 마세요.",
  ];
  if (context.room) lines.push(`현재 여행 이름: ${context.room}`);
  if (context.center)
    lines.push(
      `참고(약한 힌트): 지금 보고 있는 지도 중심은 ${context.center.lat.toFixed(4)}, ${context.center.lng.toFixed(4)} 입니다. 사용자가 지역을 한 글자도 말하지 않았을 때만 이 근처로 잡고, 지역을 말했다면 이 좌표는 완전히 무시하세요.`
    );
  if (context.pinNames && context.pinNames.length > 0)
    lines.push(`이미 지도에 꽂힌 핀(중복 추천 금지): ${context.pinNames.join(", ")}`);
  return lines.join("\n");
}

// OpenAI 형식 도구 정의 — DeepSeek이 이 모양을 그대로 받는다.
const TOOLS = [
  {
    type: "function",
    function: {
      name: "naver_blog_search",
      description:
        "네이버 블로그에서 후기 글을 찾는다. 이 앱에서 웹 조사는 오직 이 도구로만 한다. 지역과 종류를 함께 넣으면 좋다(예: '다낭 로컬 맛집 후기'). 한 번에 여러 검색어를 동시에 시켜도 된다. 돌려주는 링크는 추천 근거(sources)로 그대로 써야 한다. 결과의 sponsored 는 협찬 글 표시, postdate 는 올린 날짜다.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "검색어(한국어 권장)" },
          recent: {
            type: "boolean",
            description: "최신 글 순으로 볼지 여부(요즘도 하는 가게인지 확인할 때 true)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_pins",
      description:
        "확정한 추천 장소 목록을 앱에 제출한다. 사용자에게 고르기 시트로 보여지므로 마지막에 한 번만 호출한다. 좌표는 앱이 이름과 지역으로 직접 찾으니 넣지 않는다. sources는 반드시 naver_blog_search 결과 링크를 쓴다.",
      parameters: {
        type: "object",
        properties: {
          pins: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "가게·명소의 정확한 이름(간판 이름 그대로)",
                },
                area: {
                  type: "string",
                  description: "지역·도시(예: '서울 성수동', '다낭')",
                },
                area_lat: {
                  type: "number",
                  description: "그 지역·도시 중심의 대략적인 위도(가게 좌표가 아니라 도시 중심)",
                },
                area_lng: {
                  type: "number",
                  description: "그 지역·도시 중심의 대략적인 경도",
                },
                type: { type: "string", enum: [...PIN_TYPE_VALUES] },
                memo: {
                  type: "string",
                  description: "후기에서 본 추천 이유 한 줄",
                },
                sources: {
                  type: "array",
                  description: "근거로 삼은 블로그 글 1~3개. 검색 결과의 링크만 쓴다.",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      url: { type: "string" },
                    },
                    required: ["title", "url"],
                  },
                },
              },
              required: ["name", "area", "area_lat", "area_lng", "type", "sources"],
            },
          },
        },
        required: ["pins"],
      },
    },
  },
];

interface ToolCall {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}

interface ApiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ProposedPin {
  name?: unknown;
  area?: unknown;
  area_lat?: unknown;
  area_lng?: unknown;
  type?: unknown;
  memo?: unknown;
  sources?: unknown;
}

/** 링크를 비교용으로 다듬는다 — 앞뒤 공백과 끝 슬래시 차이로 같은 글을 다른 글로 보지 않게. */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    return Response.json({ ok: false, error: NO_AI_KEY }, { status: 503 });
  }
  const viaRouter = apiKey.startsWith("sk-or-");
  const apiUrl = viaRouter ? ROUTER_URL : DIRECT_URL;
  const model = viaRouter ? ROUTER_MODEL : DIRECT_MODEL;
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
  const messages: ApiMessage[] = [
    { role: "system", content: buildSystem(context) },
    ...turns.slice(-12).map((m) => ({ role: m.role, content: m.text }) as ApiMessage),
  ];

  // 이번 대화에서 네이버가 실제로 돌려준 블로그 글 — 지어낸 출처를 걸러내는 기준이자
  // 화면 "출처" 줄에 쓰는 목록이다.
  const blogSeen = new Map<string, NaverBlogItem>();

  let reply = "";
  let proposed: Pin[] = [];
  const startedAt = Date.now();

  try {
    for (let i = 0; i < MAX_TURNS; i++) {
      // 남은 시간이 없으면 새로 부르지 않는다. 한 번 부를 때도 남은 시간을 넘기지 않게 잘라 준다
      // — 그래야 Vercel이 60초에 끊기 전에 우리가 먼저 정리하고 답을 돌려줄 수 있다.
      const left = TOTAL_BUDGET_MS - (Date.now() - startedAt);
      if (left < 3000) break;

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          max_tokens: 4000,
          // 중개소를 거칠 때는 "혼잣말로 길게 생각하기"를 꺼서 답을 빨리 받는다.
          // 이 일은 검색 결과를 옮겨 담는 단순한 일이라 오래 생각할 필요가 없다.
          ...(viaRouter ? { reasoning: { enabled: false } } : {}),
        }),
        signal: AbortSignal.timeout(Math.min(CALL_TIMEOUT_MS, left)),
      });

      if (res.status === 401 || res.status === 403) {
        return Response.json({ ok: false, error: NO_AI_KEY }, { status: 503 });
      }
      if (!res.ok) {
        return Response.json(
          {
            ok: false,
            error: `AI 응답에 실패했어요 (${res.status}). 잠시 뒤 다시 시도해 주세요.`,
          },
          { status: 502 }
        );
      }

      const data = (await res.json()) as {
        choices?: { message?: ApiMessage; finish_reason?: string }[];
      };
      const message = data.choices?.[0]?.message;
      if (!message) break;

      const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (calls.length === 0) {
        reply = (message.content ?? "").trim();
        break;
      }

      messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: calls,
      });

      // 한 번에 여러 도구를 시키면 하나씩 기다리지 않고 동시에 돌린다.
      // 검색·좌표 확인은 각각 8초까지 걸리는데, 줄 세우면 60초 상한에 금방 닿는다.
      const done = await Promise.all(
        calls.map(async (call) => {
          const name = call.function?.name ?? "";
          const args = parseArgs(call.function?.arguments ?? "");
          let result = "";

          if (name === "naver_blog_search") {
            try {
              const found = await searchNaverBlog(
                String(args.query ?? ""),
                8,
                args.recent === true
              );
              for (const item of found) {
                const key = normalizeUrl(item.url);
                if (key && !blogSeen.has(key)) blogSeen.set(key, item);
              }
              // 모델에게는 짧게 줄여 보낸다 — 글이 길면 생각이 느려지고 시간 상한에 걸린다.
              const slim = found.slice(0, 6).map((b) => ({
                title: b.title,
                url: b.url,
                snippet: b.snippet.slice(0, 160),
                blogger: b.blogger,
                postdate: b.postdate,
                sponsored: b.sponsored,
              }));
              result =
                slim.length > 0
                  ? JSON.stringify(slim)
                  : "후기를 찾지 못했어요. 검색어를 바꿔서 다시 시도해 보세요.";
            } catch {
              result = "블로그 검색이 잠시 응답하지 않아요. 다른 검색어로 시도해 보세요.";
            }
          } else if (name === "propose_pins") {
            const list = Array.isArray(args.pins) ? (args.pins as ProposedPin[]) : [];
            const { pins, droppedNoSource, droppedNoMention, droppedNoSpot } = await buildPins(
              list,
              blogSeen,
              context.center,
              request.url
            );
            proposed = pins;
            const buts = [
              droppedNoSource > 0 ? `출처가 확인되지 않은 ${droppedNoSource}곳` : "",
              droppedNoMention > 0 ? `근거 글에 이름이 없는 ${droppedNoMention}곳` : "",
              droppedNoSpot > 0 ? `위치를 못 찾은 ${droppedNoSpot}곳` : "",
            ].filter(Boolean);
            result =
              pins.length > 0
                ? `${pins.length}곳이 등록되었어요.${
                    buts.length > 0 ? ` ${buts.join("과 ")}은 버렸어요.` : ""
                  } 사용자에게 짧게 안내하고 마치세요.`
                : "등록된 곳이 없어요. 출처는 naver_blog_search 결과 링크를 그대로 넣고, name에는 간판 이름, area에는 지역을 정확히 적어 다시 제출하세요.";
          } else {
            result = "그런 도구는 없어요.";
          }

          return {
            role: "tool" as const,
            tool_call_id: call.id,
            content: result,
          };
        })
      );
      messages.push(...done);
    }
  } catch (err) {
    // 무엇 때문에 끊겼는지는 서버 기록에만 남긴다(사용자에게는 쉬운 안내만 나간다).
    console.error("[assistant] 왕복 중단:", err);
    // 마지막 왕복에서 시간이 끊겨도, 앞에서 이미 찾아 둔 곳이 있으면 버리지 않고 그것만 돌려준다.
    if (proposed.length === 0 && !reply) {
      return Response.json(
        {
          ok: false,
          error: "AI 응답 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.",
        },
        { status: 502 }
      );
    }
  }

  if (!reply && proposed.length === 0) {
    return Response.json(
      {
        ok: false,
        error: "시간 안에 답을 만들지 못했어요. 질문을 조금 좁혀서 다시 물어봐 주세요.",
      },
      { status: 504 }
    );
  }

  const sources = [...blogSeen.values()].slice(0, MAX_REPLY_SOURCES).map((b) => ({
    title: b.title,
    url: b.url,
    blogger: b.blogger,
  }));

  return Response.json({
    ok: true,
    reply:
      reply || (proposed.length > 0 ? `${proposed.length}곳을 찾았어요 — 골라서 꽂아 보세요.` : ""),
    pins: proposed,
    sources,
  });
}

/** 이름을 견주기 좋게 다듬는다 — 띄어쓰기·괄호·점 따위를 빼고 소문자로. */
function squeeze(s: string): string {
  return s.replace(/[\s()[\]·・.,'"`’”“\-_/]/g, "").toLowerCase();
}

/**
 * 그 가게 이름이 근거로 댄 글 안에 실제로 나오는지 본다.
 * AI가 검색 결과에 없던 가게를 지어내고 아무 링크나 붙이는 것을 막는 마지막 관문이다.
 */
function mentionsName(name: string, hits: NaverBlogItem[]): boolean {
  const n = squeeze(name);
  if (n.length < 2) return false;
  const texts = hits.map((h) => squeeze(`${h.title} ${h.snippet}`));
  if (texts.some((t) => t.includes(n))) return true;
  // 이름이 길면 앞 네 글자만이라도 글에 나오는지 본다("업사이드커피 성수 본점" → "업사이드").
  const head = n.slice(0, Math.min(4, n.length));
  return head.length >= 2 && texts.some((t) => t.includes(head));
}

/** 두 지점이 얼마나 떨어져 있는지 대충 재는 값(도 단위) — 엉뚱한 나라 좌표를 걸러내는 용도. */
function roughFar(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng);
}

/**
 * 이름과 지역으로 좌표를 찾는다. 두 곳(세계 장소 사전 / 지도 화면 읽기)에 동시에 물어보고
 * 먼저 쓸 만한 답을 고른다. 지금 보는 지도에서 너무 멀면(약 500km 밖) 다른 답을 쓴다.
 */
async function locate(
  name: string,
  area: string,
  anchor: { lat: number; lng: number } | undefined,
  base: string
): Promise<{ lat: number; lng: number; address: string } | null> {
  const q = [name, area].filter(Boolean).join(" ").trim();
  if (!q) return null;
  const [byNaver, byDict, byMap] = await Promise.all([
    // 네이버 장소 창구는 열쇠가 있을 때만 답한다(없으면 빈 목록)
    searchNaverLocal(q).catch(() => []),
    geocode(q, anchor).catch(() => []),
    geocodeByPlaceApi(q, base).catch(() => []),
  ]);

  // 세계 장소 사전은 가게를 모르면 그냥 그 동네 길 이름을 돌려준다.
  // 그걸 그대로 쓰면 서로 다른 가게가 죄다 같은 자리에 겹쳐 꽂힌다 — 이름이 닮은 답만 받는다.
  const dictHits = byDict.filter((c) => {
    const a = squeeze(c.name);
    const b = squeeze(name);
    if (!a || !b) return false;
    return a.includes(b) || b.includes(a) || (b.length >= 3 && a.includes(b.slice(0, 3)));
  });

  // 정확한 순서: 네이버 장소 → 구글 지도 읽기 → 이름이 닮은 세계 장소 사전
  const all = [...byNaver, ...byMap, ...dictHits];
  if (all.length === 0) return null;

  // 그 동네 안에 있는 답만 인정한다. 같은 이름의 가게가 다른 나라에도 있어서,
  // 이 관문이 없으면 "다낭 냐벱"이 서울 어딘가로 꽂힌다.
  const inArea = anchor ? all.filter((c) => roughFar(c, anchor) < 2) : all;
  if (inArea.length === 0) return null;

  const picked = inArea[0];
  // 고른 자리에 주소가 안 붙어 있으면, 바로 옆(약 1km 안) 답이 아는 주소를 빌려 쓰고,
  // 그래도 없으면 그 자리의 주소를 거꾸로 물어본다.
  let address =
    picked.address ||
    [...byNaver, ...dictHits].find((c) => c.address && roughFar(c, picked) < 0.01)?.address ||
    "";
  if (!address) address = await reverseAddress(picked.lat, picked.lng).catch(() => "");
  return { lat: picked.lat, lng: picked.lng, address };
}

/**
 * AI가 낸 후보를 핀으로 바꾼다.
 * 출처는 네이버가 실제로 돌려준 글 목록에 있는 것만 인정하고, 하나도 남지 않으면 그 곳은 버린다.
 * 좌표는 AI를 믿지 않고 여기서 직접 찾는다(여러 곳을 동시에 찾아 시간을 아낀다).
 */
async function buildPins(
  list: ProposedPin[],
  blogSeen: Map<string, NaverBlogItem>,
  near: { lat: number; lng: number } | undefined,
  base: string
): Promise<{
  pins: Pin[];
  droppedNoSource: number;
  droppedNoMention: number;
  droppedNoSpot: number;
}> {
  const now = Date.now();
  let droppedNoSource = 0;
  let droppedNoMention = 0;

  // 1단계 — 이름과 출처가 멀쩡한 후보만 남긴다
  const kept: {
    name: string;
    area: string;
    anchor?: { lat: number; lng: number };
    type: PinType;
    memo: string;
    sources: PinSource[];
  }[] = [];
  for (const p of list) {
    if (kept.length >= MAX_PINS) break;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) {
      droppedNoSource++;
      continue;
    }

    const sources: PinSource[] = [];
    const hits: NaverBlogItem[] = [];
    const seenHere = new Set<string>();
    for (const raw of Array.isArray(p.sources) ? p.sources : []) {
      if (sources.length >= MAX_SOURCES_PER_PIN) break;
      const url = typeof (raw as PinSource)?.url === "string" ? (raw as PinSource).url : "";
      const key = normalizeUrl(url);
      const hit = blogSeen.get(key);
      if (!hit || seenHere.has(key)) continue;
      seenHere.add(key);
      hits.push(hit);
      // 제목도 검색 결과 것을 쓴다 — 지어낸 제목이 화면에 나가지 않게.
      sources.push({ title: hit.title, url: hit.url });
    }
    if (sources.length === 0) {
      droppedNoSource++;
      continue;
    }
    // 근거로 댄 글에 그 가게 이름이 아예 안 나오면, 지어낸 곳으로 보고 버린다.
    if (!mentionsName(name, hits)) {
      droppedNoMention++;
      continue;
    }

    const type: PinType = (PIN_TYPE_VALUES as readonly string[]).includes(String(p.type))
      ? (p.type as PinType)
      : "etc";
    // AI가 적어 준 동네 중심 좌표 — 값이 이상하면 안 쓴다.
    const aLat = Number(p.area_lat);
    const aLng = Number(p.area_lng);
    const anchor =
      Number.isFinite(aLat) &&
      Number.isFinite(aLng) &&
      Math.abs(aLat) <= 90 &&
      Math.abs(aLng) <= 180
        ? { lat: aLat, lng: aLng }
        : undefined;

    kept.push({
      name,
      area: typeof p.area === "string" ? p.area : "",
      anchor,
      type,
      memo: typeof p.memo === "string" ? p.memo : "",
      sources,
    });
  }

  // 2단계 — 남은 후보의 좌표를 한꺼번에 찾는다.
  // 잣대는 AI가 적어 준 그 동네 중심 좌표이고, 없으면 지금 보는 지도 위치를 쓴다.
  // 한꺼번에 우르르 물으면 장소 사전이 "너무 잦다"며 몇 건을 흘려버려 주소가 빈 채로 남는다.
  // 0.15초씩 시차를 두고 보내면 다 받아 준다(전체는 여전히 1초 남짓).
  const spots = await Promise.all(
    kept.map(async (k, i) => {
      await new Promise((r) => setTimeout(r, i * 150));
      return locate(k.name, k.area, k.anchor ?? near, base);
    })
  );

  const pins: Pin[] = [];
  let droppedNoSpot = 0;
  kept.forEach((k, i) => {
    const spot = spots[i];
    if (!spot) {
      droppedNoSpot++;
      return;
    }
    pins.push({
      id: `ai-${now}-${pins.length}`,
      lat: spot.lat,
      lng: spot.lng,
      type: k.type,
      name: k.name,
      memo: k.memo,
      emoji: PIN_EMOJI[k.type],
      isAI: true,
      createdAt: now + pins.length,
      sources: k.sources,
      address: spot.address,
    });
  });

  return { pins, droppedNoSource, droppedNoMention, droppedNoSpot };
}
