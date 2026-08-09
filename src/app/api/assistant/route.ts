import { cleanLegacyAiMemo, PIN_TYPE_VALUES, type Pin, type PinSource, type PinType } from "@/lib/types";
import {
  fetchBlogPost,
  searchNaverBlog,
  searchNaverLocal,
  type BlogPlaceCard,
  type NaverBlogItem,
} from "@/lib/naver";

// 비서 API — 퍼플렉시티 같은 AI 검색과 같은 방식으로 일한다:
// ① 검색어 여러 개로 후기 목록을 찾고 → ② AI가 읽을 만한 글을 스스로 골라 본문을 읽고 →
// ③ 읽은 내용을 근거로 장소를 골라, 답 한 편과 핀 후보를 함께 돌려준다.
// 어느 글을 믿을지는 낱말 규칙이 아니라 AI의 판단에 맡긴다(광고 글도 정보가 좋으면 쓴다).
// 후보는 바로 꽂히지 않고, 채팅 답변 카드에서 사용자가 마음에 드는 것만 꽂는다.
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
// 한 곳에 근거 글이 하나뿐이면 빈약해 보인다 — 본문에 그 가게 이름이 적힌 글로 여기까지 채운다.
const MIN_SOURCES_PER_PIN = 2;
const MAX_REPLY_SOURCES = 6;
const CALL_TIMEOUT_MS = 30_000;
const TOTAL_BUDGET_MS = 50_000;

// Vercel 함수 실행 상한(초) — 검색 + 좌표 확인 왕복 여유
export const maxDuration = 60;

const NO_AI_KEY =
  "AI 접속 정보가 아직 없어요 — 서버에 DEEPSEEK_API_KEY나 OPENROUTER_API_KEY 중 하나를 넣어야 비서가 일할 수 있어요(.env.example 참고).";
// 핀 타입별 이모지 — pinTypes.ts와 같은 값(그 파일은 lucide 아이콘을 끌고 와서 서버에선 따로 둠)
// 종류 목록 자체는 types.ts에서 가져온다(따로 적으면 어긋난다). 이모지만 여기서 붙인다.
const PIN_EMOJI: Record<PinType, string> = {
  food: "🍜",
  spot: "📸",
  cafe: "☕",
  stay: "🛏",
  massage: "💆",
  airport: "✈️",
  fruit: "🍎",
  shopping: "🛍️",
  market: "🛒",
  etc: "📍",
};

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
    "당신은 여행 핀지도 앱의 조사 비서입니다. 퍼플렉시티 같은 AI 검색처럼 '검색 → 읽을 글 고르기 → 본문 읽기 → 종합' 순서로 일합니다.",
    "사용자가 맛집·관광지·카페·숙소·마사지·쇼핑·시장 같은 곳을 찾아 달라고 하면:",
    "1. naver_blog_search — 관점이 다른 검색어 2~3개를 한 차례에 같이 시킨다(예: '○○ 맛집 추천', '○○ 현지인 맛집', '○○ 3일 코스'). 하나씩 차례로 물으면 시간이 모자랍니다.",
    "2. read_blog — 검색 결과의 제목·요약만 보고 정하지 말고, 정보가 많아 보이는 글 3~5개를 골라 본문을 한 번에 읽는다.",
    "3. propose_pins — 읽은 내용을 근거로 장소를 골라 한 번에 제출한다.",
    "어떤 글을 믿을지는 규칙이 아니라 당신의 판단입니다. 실제로 다녀온 티가 나는지, 정보가 구체적인지, 너무 오래된 글은 아닌지(postdate) 스스로 가려서 정하세요. 광고·협찬 글이어도 정보가 정확하고 쓸 만하면 근거로 써도 됩니다.",
    "지역 규칙(가장 중요): 사용자가 말한 지역·도시가 무조건 우선입니다. 검색어와 area 칸에는 사용자가 말한 지역 이름을 그대로 넣으세요. 사용자가 '다낭'이라고 하면 다낭만 찾습니다.",
    "위치 정보는 읽은 글에서 그대로 가져옵니다:",
    "- 본문에 지도 카드(장소 이름·주소·좌표)가 붙어 있으면 그 값을 그대로 씁니다 — address 에 주소를, lat/lng 에 카드의 좌표 숫자를 그대로 복사하세요.",
    "- 본문 글 속에 주소만 적혀 있으면 address 에 그 주소를 옮겨 적으세요(블로그 글에는 구글 지도 주소를 적어 두는 경우가 많습니다).",
    "- 본문에 없는 좌표를 지어내는 것은 금지입니다. 없으면 lat/lng 를 비워 두세요 — 앱이 직접 찾습니다.",
    "area 에는 지역 이름을, area_lat/area_lng 에는 그 지역(도시·동네) 중심의 대략적인 좌표를 적으세요. 예: 다낭 16.05/108.21, 서울 성수동 37.544/127.056. 이 값은 앱이 '가게가 그 동네에 있는지' 재는 잣대로만 씁니다.",
    "memo는 줄글이 아니라 짧은 토막 2~3개를 ' · '(가운뎃점)로 이어 붙여 적으세요. 토막 하나는 15자 안팎, 명사로 끝냅니다. 예: '90분 아로마 코스 인기 · 저녁은 예약 꽉 참 · 2인 5만 원'. 토막에는 '갈지 말지 정하는 데' 도움 되는 알맹이만 담으세요 — 후기들이 입을 모아 칭찬한 점, 대표 메뉴·서비스와 대략 가격, 가 본 사람만 아는 팁(예약·웨이팅·가기 좋은 시간).",
    "별점·리뷰 개수·업종 분류·지역 이름·조사 날짜를 나열하는 메모는 금지입니다(예: '구글 ★4.7 (리뷰 130개) · 스파 · 다낭'). 그런 정보는 앱이 이미 보여 주거나 갈지 말지 정하는 데 도움이 안 됩니다. 후기에서 알맹이를 못 찾았으면 지어내지 말고 memo를 비워 두세요.",
    "sources에는 반드시 검색 결과로 받은 링크만 그대로 붙여 넣으세요. 링크를 지어내면 그 후보는 버려집니다. 한 곳마다 그 가게가 언급된 글을 2~3개 붙이세요(정말 한 글에만 나오면 1개도 괜찮습니다). 후보는 3~8곳이 적당합니다.",
    "장소 추천이 아닌 일반 질문에는 도구 없이 한국어로 짧게 답하세요.",
    "가장 중요한 규칙(어기면 답이 버려집니다): 최종 답변에는 propose_pins 가 '등록되었어요'라고 알려 준 곳만 언급할 수 있습니다. 등록되지 않은 곳(출처·위치 확인에 실패해 버려진 곳)의 이름은 절대 쓰지 마세요 — 화면 카드에 없는 이름을 답에 쓰면 사용자는 '찾았다더니 왜 없냐'고 느낍니다.",
    "최종 답변은 아주 짧게, 정해진 모양으로만 씁니다. 첫 줄에 한 줄 요약 하나(35자 안팎), 그 아래에 '- '로 시작하는 핵심 줄 2~3개(각 30자 안팎). 전체 4줄을 넘기지 마세요.",
    "핵심 줄에는 등록된 곳들을 아우르는 정보만 적습니다 — 후기들이 입을 모은 점, 조심할 점(웨이팅·휴무·현금만 등), 가기 좋은 시간, 묶어 다니기 좋은 동선. 장소 이름을 한 줄에 하나씩 나열하거나 카드에 이미 있는 주소·메모를 다시 쓰는 것은 금지입니다(화면 카드가 대신 보여 줍니다). 인사말·맺음말도 쓰지 마세요.",
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
        "네이버 블로그에서 후기 글 목록을 찾는다(제목·요약 두 줄·글쓴이·postdate). 지역과 종류를 함께 넣으면 좋다(예: '다낭 로컬 맛집 후기'). 한 번에 여러 검색어를 동시에 시켜도 된다. 돌려주는 링크는 read_blog 로 읽거나 추천 근거(sources)로 그대로 쓴다.",
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
      name: "read_blog",
      description:
        "검색으로 찾은 블로그 글의 본문을 읽는다. 한 번에 3~5개 링크를 같이 넣는 게 빠르다. 본문 글(text)과, 글쓴이가 붙여 둔 지도 카드(places: 가게 이름·주소·정확한 좌표), 본문 속 지도 링크(map_links)를 돌려준다. 지도 카드의 주소·좌표는 propose_pins 에 그대로 복사해서 쓴다.",
      parameters: {
        type: "object",
        properties: {
          urls: {
            type: "array",
            description: "읽을 글 링크 — naver_blog_search 가 돌려준 링크만 넣는다(최대 5개)",
            items: { type: "string" },
          },
        },
        required: ["urls"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_pins",
      description:
        "확정한 추천 장소 목록을 앱에 제출한다. 사용자에게 카드로 보여지므로 마지막에 한 번만 호출한다. 주소·좌표는 read_blog 로 읽은 글에 있으면 그대로 복사하고, 없으면 비워 둔다(앱이 직접 찾는다). sources는 반드시 검색 결과 링크를 쓴다.",
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
                  description:
                    "갈지 말지 정하는 데 도움 되는 내용 1~2문장(공통 칭찬·대표 메뉴와 가격·팁). 별점·리뷰 수·분류·지역·날짜 나열 금지 — 알맹이가 없으면 비워 둔다",
                },
                address: {
                  type: "string",
                  description: "읽은 글(본문·지도 카드)에서 본 주소 — 글에 없으면 비워 둔다",
                },
                lat: {
                  type: "number",
                  description: "읽은 글의 지도 카드에 있던 위도 숫자 그대로 — 카드가 없으면 넣지 않는다",
                },
                lng: {
                  type: "number",
                  description: "읽은 글의 지도 카드에 있던 경도 숫자 그대로 — 카드가 없으면 넣지 않는다",
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
  address?: unknown;
  lat?: unknown;
  lng?: unknown;
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
  // AI가 본문까지 읽은 글과, 그 글에 붙어 있던 지도 카드 — 좌표 검증과 출처 순서에 쓴다.
  const readUrls = new Set<string>();
  const cardsSeen: BlogPlaceCard[] = [];
  // 본문까지 읽어 둔 글 — 어느 글에 어떤 가게 이름이 적혀 있는지 나중에 다시 훑어,
  // 출처가 한 개뿐인 곳에 진짜 근거를 더 붙이는 데 쓴다(퍼플렉시티식 근거 보강).
  const readBodies = new Map<string, { title: string; url: string; text: string }>();

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
              }));
              result =
                slim.length > 0
                  ? JSON.stringify(slim)
                  : "후기를 찾지 못했어요. 검색어를 바꿔서 다시 시도해 보세요.";
            } catch {
              result = "블로그 검색이 잠시 응답하지 않아요. 다른 검색어로 시도해 보세요.";
            }
          } else if (name === "read_blog") {
            // 검색이 실제로 돌려준 링크만 읽는다 — AI가 아무 주소나 열게 두면 위험하다.
            const asked = (Array.isArray(args.urls) ? args.urls : [])
              .filter((u): u is string => typeof u === "string")
              .map((u) => blogSeen.get(normalizeUrl(u)))
              .filter((b): b is NaverBlogItem => Boolean(b))
              .slice(0, 5);
            if (asked.length === 0) {
              result = "읽을 수 있는 링크가 없어요. naver_blog_search 결과의 링크를 그대로 넣으세요.";
            } else {
              const bodies = await Promise.all(
                asked.map((b) => fetchBlogPost(b.url).catch(() => null))
              );
              const readable = bodies
                .map((body, idx) => {
                  if (!body) return null;
                  readUrls.add(normalizeUrl(asked[idx].url));
                  cardsSeen.push(...body.places);
                  readBodies.set(normalizeUrl(asked[idx].url), {
                    title: asked[idx].title,
                    url: asked[idx].url,
                    text: body.text,
                  });
                  return {
                    url: body.url,
                    title: asked[idx].title,
                    text: body.text,
                    places: body.places,
                    map_links: body.mapLinks,
                  };
                })
                .filter(Boolean);
              result =
                readable.length > 0
                  ? JSON.stringify(readable)
                  : "본문을 열지 못했어요. 검색 결과의 요약만으로 판단하거나 다른 글을 읽어 보세요.";
            }
          } else if (name === "propose_pins") {
            const list = Array.isArray(args.pins) ? (args.pins as ProposedPin[]) : [];
            const { pins, dropped } = await buildPins(
              list,
              blogSeen,
              cardsSeen,
              readBodies,
              context.center,
              request.url
            );
            proposed = pins;
            // 어떤 이름이 화면 카드로 나갔는지 그대로 알려 준다 — 이 목록에 없는 이름을
            // 답에 쓰면 "찾았다더니 카드에 없다"가 되므로, 여기서 못을 박는다.
            result =
              pins.length > 0
                ? `${pins.length}곳이 등록되었어요. 화면 카드로 나가는 이름은 이것뿐입니다: ${pins
                    .map((p) => p.name)
                    .join(", ")}.${
                    dropped.length > 0
                      ? ` 다음 ${dropped.length}곳은 출처나 위치를 확인하지 못해 버렸으니 답변에서 이름을 절대 언급하지 마세요: ${dropped.join(", ")}.`
                      : ""
                  } 위 이름들만 근거로 짧게 안내하고 마치세요.`
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

  // 출처 줄에는 AI가 본문까지 읽은 글을 먼저 보여 준다 — 답의 진짜 근거이기 때문.
  const sources = [...blogSeen.entries()]
    .sort(([a], [b]) => Number(readUrls.has(b)) - Number(readUrls.has(a)))
    .slice(0, MAX_REPLY_SOURCES)
    .map(([, b]) => ({
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
 * 가게 이름을 견주기 좋은 토막들로 나눈다 — 간판에 한글 이름과 현지 이름이 같이 붙은 곳이 많아
 * ("옥뎀39 (Ốc Đêm 39)") 통째로만 견주면 글 본문에서 못 찾는다. 두 글자 미만 토막은 버린다
 * (아무 글에나 걸려 엉뚱한 글이 근거로 붙는다).
 */
function nameKeys(name: string): string[] {
  const inParen = /\(([^)]+)\)/.exec(name)?.[1] ?? "";
  const outParen = name.replace(/\([^)]*\)/g, "");
  const keys: string[] = [];
  for (const part of [outParen, inParen, name]) {
    const k = squeeze(part);
    if (k.length >= 2 && !keys.includes(k)) keys.push(k);
  }
  return keys;
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
  hints: string[],
  anchor: { lat: number; lng: number } | undefined,
  base: string
): Promise<{ lat: number; lng: number; address: string } | null> {
  // 간판에 두 이름이 붙어 있는 곳이 많다 — "옥뎀39 (Ốc Đêm 39)"처럼.
  // 한 벌로만 물으면 못 찾으니 이름을 갈래로 나눠 여러 벌을 만든다.
  const inParen = /\(([^)]+)\)/.exec(name)?.[1]?.trim() ?? "";
  const outParen = name.replace(/\([^)]*\)/g, "").trim();
  const names = [name, inParen, outParen].filter(Boolean);

  const queries: string[] = [];
  for (const hint of [...hints.filter(Boolean), ""]) {
    for (const n of names) {
      const q = [n, hint].filter(Boolean).join(" ").trim();
      if (q && !queries.includes(q)) queries.push(q);
    }
  }
  if (queries.length === 0) return null;

  // 가장 그럴듯한 한 벌(이름 + 글에서 본 주소)을 먼저 물어본다. 대부분 여기서 끝난다.
  const best = await locateOnce(queries[0], name, anchor, base).catch(() => null);
  if (best) return best;

  // 빗나갔을 때만 나머지 벌을 한꺼번에 던진다. 차례로 물으면 8초씩 쌓여 시간 상한에 걸리고,
  // 처음부터 다 던지면 장소 사전이 "너무 잦다"며 답을 흘려버린다 — 그래서 2단으로 나눴다.
  const rest = queries.slice(1, 3);
  if (rest.length === 0) return null;
  const tries = await Promise.all(
    rest.map((q) => locateOnce(q, name, anchor, base).catch(() => null))
  );
  return tries.find((t): t is { lat: number; lng: number; address: string } => Boolean(t)) ?? null;
}

/** 검색어 한 벌로 자리를 찾아본다 — 위의 locate 가 여러 벌을 차례로 던지는 데 쓴다. */
async function locateOnce(
  q: string,
  name: string,
  anchor: { lat: number; lng: number } | undefined,
  base: string
): Promise<{ lat: number; lng: number; address: string } | null> {
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
 * 출처는 네이버가 실제로 돌려준 글 목록에 있는 것만 인정하고, 하나뿐이면 본문에 그 가게 이름이
 * 적힌 읽은 글로 채운다. 하나도 남지 않으면 그 곳은 버린다.
 * 자리는 ① 읽은 글의 지도 카드 좌표(글쓴이가 직접 붙인 값이라 가장 정확)를 먼저 쓰고,
 * 없으면 ② 이름·현지 이름 × 주소·지역으로 만든 검색어를 한꺼번에 던져 먼저 걸리는 답을 쓴다.
 * 버린 곳 이름은 그대로 돌려줘서, AI가 답변에서 그 이름을 말하지 못하게 한다.
 */
async function buildPins(
  list: ProposedPin[],
  blogSeen: Map<string, NaverBlogItem>,
  cardsSeen: BlogPlaceCard[],
  readBodies: Map<string, { title: string; url: string; text: string }>,
  near: { lat: number; lng: number } | undefined,
  base: string
): Promise<{
  pins: Pin[];
  /** 카드로 못 만들고 버린 곳 이름 — AI가 답변에서 언급하지 못하게 그대로 알려 준다 */
  dropped: string[];
}> {
  const now = Date.now();
  const dropped: string[] = [];

  // 1단계 — 이름과 출처가 멀쩡한 후보만 남긴다
  const kept: {
    name: string;
    area: string;
    address: string;
    card?: BlogPlaceCard;
    anchor?: { lat: number; lng: number };
    type: PinType;
    memo: string;
    sources: PinSource[];
  }[] = [];
  for (const p of list) {
    if (kept.length >= MAX_PINS) break;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) continue;

    const sources: PinSource[] = [];
    const seenHere = new Set<string>();
    for (const raw of Array.isArray(p.sources) ? p.sources : []) {
      if (sources.length >= MAX_SOURCES_PER_PIN) break;
      const url = typeof (raw as PinSource)?.url === "string" ? (raw as PinSource).url : "";
      const key = normalizeUrl(url);
      const hit = blogSeen.get(key);
      if (!hit || seenHere.has(key)) continue;
      seenHere.add(key);
      // 제목도 검색 결과 것을 쓴다 — 지어낸 제목이 화면에 나가지 않게.
      sources.push({ title: hit.title, url: hit.url });
    }
    // AI가 근거 글을 하나만 달아 두는 일이 잦다. 읽어 둔 글 본문을 다시 훑어,
    // 그 가게 이름이 실제로 적혀 있는 글을 더 붙인다(본문에 이름이 있는 글만 쓰므로
    // 지어낸 연결이 아니다 — 퍼플렉시티도 '검색으로 가져온 것'만 근거로 삼는다).
    if (sources.length < MIN_SOURCES_PER_PIN) {
      const keys = nameKeys(name);
      for (const body of readBodies.values()) {
        if (sources.length >= MAX_SOURCES_PER_PIN) break;
        const key = normalizeUrl(body.url);
        if (seenHere.has(key)) continue;
        const squeezed = squeeze(body.text);
        if (!keys.some((k) => squeezed.includes(k))) continue;
        seenHere.add(key);
        sources.push({ title: body.title, url: body.url });
      }
    }
    if (sources.length === 0) {
      dropped.push(name);
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

    // AI가 옮겨 적은 좌표는 실제로 읽은 글의 지도 카드와 맞을 때만 믿는다
    // (300m 안이면 같은 카드로 본다). 안 맞으면 지어낸 값으로 보고 버린다.
    const pLat = Number(p.lat);
    const pLng = Number(p.lng);
    const card =
      Number.isFinite(pLat) && Number.isFinite(pLng)
        ? cardsSeen.find((c) => Math.abs(c.lat - pLat) + Math.abs(c.lng - pLng) < 0.003)
        : undefined;

    kept.push({
      name,
      area: typeof p.area === "string" ? p.area : "",
      address: typeof p.address === "string" ? p.address.trim() : "",
      card,
      anchor,
      type,
      // 말로만 금지하면 AI가 어기고 또 적을 수 있다 — 코드로도 별점 나열식 메모를 걸러 낸다.
      memo: cleanLegacyAiMemo(typeof p.memo === "string" ? p.memo : ""),
      sources,
    });
  }

  // 2단계 — 남은 후보의 자리를 한꺼번에 정한다.
  // 지도 카드가 있으면 찾기 없이 바로 쓴다(가장 정확하고 가장 빠르다).
  // 없으면 주소(글에서 본 것) 먼저, 그래도 안 되면 지역 이름으로 찾는다.
  // 한꺼번에 우르르 물으면 장소 사전이 "너무 잦다"며 몇 건을 흘려버려 주소가 빈 채로 남는다.
  // 0.15초씩 시차를 두고 보내면 다 받아 준다(전체는 여전히 1초 남짓).
  const spots = await Promise.all(
    kept.map(async (k, i) => {
      const anchor = k.anchor ?? near;
      // 카드 좌표도 그 동네 안일 때만 쓴다 — 여러 도시를 다룬 글에서 엉뚱한 도시 카드를
      // 옮겨 적는 실수를 거른다. 동네를 벗어나면 아래의 찾기 길로 내려간다.
      if (k.card && (!anchor || roughFar(k.card, anchor) < 2)) {
        return {
          lat: k.card.lat,
          lng: k.card.lng,
          address: k.address || k.card.address,
        };
      }
      await new Promise((r) => setTimeout(r, i * 150));
      const spot = await locate(k.name, [k.address, k.area], anchor, base);
      return spot ? { ...spot, address: spot.address || k.address } : null;
    })
  );

  const pins: Pin[] = [];
  kept.forEach((k, i) => {
    const spot = spots[i];
    if (!spot) {
      dropped.push(k.name);
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

  return { pins, dropped };
}
