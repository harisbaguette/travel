"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ExternalLink,
  Map as MapIcon,
  MessageCircleQuestionMark,
  Pin as PinIcon,
  RotateCcw,
} from "lucide-react";
import type { Pin, PinType } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";
import { googleMapsUrl } from "@/lib/mapLinks";
import { splitMemoLines } from "@/lib/memoLines";

// 비서 화면 — AI에게 채팅으로 시키는 곳.
// 화면은 세 덩이로만 나뉜다: ① 한 줄 요약(+ 점 목록) → ② 종류별로 묶은 장소 카드 →
// ③ 카드마다 접혀 있는 근거 글. 답이 길게 쏟아져 글 벽이 서지 않도록,
// 긴 설명·근거는 전부 접어 두고 눌러야 펴진다.

/** 답변의 근거가 된 블로그 글 — 장소가 하나도 없을 때만 접힌 줄로 보여 준다. */
export interface AssistantSource {
  title: string;
  url: string;
  blogger?: string;
}

export interface AssistantMsg {
  role: "user" | "assistant";
  text: string;
  /** AI가 찾아온 핀 후보 — 카드로 보여 주고 낱개로 꽂는다 */
  pins?: Pin[];
  /** 근거로 삼은 블로그 글 목록 */
  sources?: AssistantSource[];
  /** 실패 안내 등 — 회색이 아닌 경고 톤으로 보여준다 */
  isError?: boolean;
}

interface AssistantPanelProps {
  messages: AssistantMsg[];
  loading: boolean;
  /** 이미 지도에 꽂혀 있는 핀 id들 — 카드의 꽂기 단추 상태를 정한다 */
  pinnedIds: ReadonlySet<string>;
  onSend: (text: string) => void;
  /** 카드에서 고른 핀을 지도에 꽂는다(하나든 여럿이든 같은 길) */
  onPin: (pins: Pin[]) => void;
}

const MAX_SHOWN_SOURCES = 6;

// 기다리는 동안 지금 무슨 일을 하는지 순서대로 보여 준다 — 실제 일 순서와 같다
// (검색 → 글 읽기 → 자리 확인). 몇 초에 넘어갈지는 대략의 경험값.
const LOADING_STAGES: [number, string][] = [
  [0, "후기 찾는 중…"],
  [7, "글을 읽는 중…"],
  [18, "장소와 자리를 확인하는 중…"],
  [35, "거의 다 됐어요…"],
];

function LoadingBubble() {
  const [label, setLabel] = useState(LOADING_STAGES[0][1]);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const sec = (Date.now() - started) / 1000;
      const stage = [...LOADING_STAGES].reverse().find(([at]) => sec >= at);
      if (stage) setLabel(stage[1]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="dw-card msg-in-ai flex items-center gap-2 px-3.5 py-2.5 text-sm text-[var(--text-muted)]">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
      {label}
    </div>
  );
}

/**
 * 답변 글을 세 토막으로 나눈다 — 맨 앞 한 마디(요약), 점(-)으로 시작하는 줄(핵심 목록),
 * 그 뒤에 남는 설명(접어 둔다). AI가 줄글로만 답해도 첫 문장만 세우고 나머지를 접어,
 * 화면에 글 벽이 서지 않게 한다.
 */
function splitAnswer(text: string): { head: string; bullets: string[]; rest: string } {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const bullets: string[] = [];
  const plain: string[] = [];
  for (const line of lines) {
    // 점(-·•)으로 시작하거나 "1." 같은 번호로 시작하는 줄을 핵심 목록으로 본다
    const marked = /^(?:[-•*·]|\d+[.)])\s+(.+)$/.exec(line);
    if (marked) bullets.push(marked[1].trim());
    else plain.push(line);
  }
  // 마침표 뒤에서 문장을 끊는다. 첫 문장이 요약, 나머지는 접히는 설명.
  const parts = plain.join(" ").split(/(?<=[.!?…])\s+/).filter(Boolean);
  return { head: parts[0] ?? "", bullets, rest: parts.slice(1).join(" ") };
}

/** 주소에서 어느 사이트 글인지만 뽑는다 — 출처 칩 아래 작게 붙는 이름. */
function siteName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("naver")) return "네이버 블로그";
    if (host.includes("tistory")) return "티스토리";
    return host;
  } catch {
    return "블로그";
  }
}

/** 근거 글 — 옆으로 넘겨 보는 칩 줄. 카드 하나가 여러 글을 근거로 삼아도 자리를 안 잡아먹는다. */
function SourceRail({ sources }: { sources: { title: string; url: string; blogger?: string }[] }) {
  return (
    <div className="dw-rail anim-reveal px-2.5 pb-2.5 pt-0.5">
      {sources.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="dw-src">
          <span className="dw-src-title">{s.title}</span>
          <span className="dw-src-from">
            {s.blogger || siteName(s.url)}
            <ExternalLink size={9} strokeWidth={2.4} aria-hidden />
          </span>
        </a>
      ))}
    </div>
  );
}

/** 접었다 펴는 "출처 N" 단추 — 평소엔 개수만 보이고, 누르면 아래로 칩 줄이 펴진다. */
function SourceToggle({
  count,
  open,
  onToggle,
  label,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="press flex h-8 items-center gap-1 rounded-full px-2 text-[11px] font-bold text-[var(--text-faint)] transition-colors duration-200 hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
    >
      <ChevronDown
        size={13}
        strokeWidth={2.6}
        className={`transition-transform duration-150${open ? " rotate-180" : ""}`}
        aria-hidden
      />
      {label} {count}
    </button>
  );
}

/** AI가 찾은 곳 하나 — 이름·한 줄 이유·지도 단추, 그리고 접혀 있는 근거 글. */
function CandidateCard({
  pin,
  pinned,
  onPin,
}: {
  pin: Pin;
  pinned: boolean;
  onPin: () => void;
}) {
  const [openSrc, setOpenSrc] = useState(false);
  const cfg = PIN_TYPES[pin.type];
  const sources = pin.sources ?? [];
  // 줄 쪼개는 규칙은 리스트 화면과 같은 것을 쓴다 — 두 화면이 서로 다르게 쪼개면 안 된다.
  const points = useMemo(() => splitMemoLines(pin.memo), [pin.memo]);
  return (
    <li className="anim-rise-sm overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-out)] hover:-translate-y-px hover:border-[var(--accent-soft)] hover:shadow-[var(--shadow-lift)]">
      <div className="flex items-center gap-2.5 px-2.5 py-2.5">
        <span
          className="dw-swatch"
          style={{ "--sw": cfg.color } as React.CSSProperties}
          aria-hidden
        >
          <cfg.Icon size={16} strokeWidth={2.2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-[var(--text)]">{pin.name}</span>
          <span className="truncate text-xs text-[var(--text-muted)]">
            {pin.address || cfg.label}
          </span>
        </span>
        <a
          href={googleMapsUrl(pin)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${pin.name} 구글 지도에서 보기`}
          title="구글 지도에서 보기"
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors duration-200 hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
        >
          <MapIcon size={16} strokeWidth={2.2} aria-hidden />
        </a>
        <button
          type="button"
          onClick={onPin}
          disabled={pinned}
          aria-label={pinned ? `${pin.name} 꽂음` : `${pin.name} 지도에 꽂기`}
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-[background,color,box-shadow,transform] duration-200 ease-[var(--ease-out)] ${
            pinned
              ? "bg-[var(--surface-hover)] text-[var(--text-faint)]"
              : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-lift)] active:scale-[0.97]"
          }`}
        >
          {pinned ? (
            <Check size={13} strokeWidth={3} className="anim-pop" />
          ) : (
            <PinIcon size={13} strokeWidth={2.5} />
          )}
          {pinned ? "꽂음" : "꽂기"}
        </button>
      </div>

      {/* 왜 여기냐는 설명 — 평소엔 두 줄까지만, 누르면 다 펴진다 */}
      {points.length > 0 && (
        <ul className="flex flex-col gap-0.5 pb-2 pl-[3.25rem] pr-3">
          {points.map((point, i) => (
            <li
              key={i}
              className="flex gap-1.5 text-xs leading-relaxed text-[var(--text-muted)]"
            >
              <span
                className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-[var(--text-faint)]"
                aria-hidden
              />
              <span className="min-w-0">{point}</span>
            </li>
          ))}
        </ul>
      )}

      {sources.length > 0 && (
        <>
          <div className="flex items-center border-t border-[var(--border)] px-1.5 py-0.5">
            <SourceToggle
              count={sources.length}
              open={openSrc}
              onToggle={() => setOpenSrc((v) => !v)}
              label="출처"
            />
          </div>
          {openSrc && <SourceRail sources={sources} />}
        </>
      )}
    </li>
  );
}

/** 같은 종류끼리 묶는다 — 나온 순서를 지키면서 맛집·카페처럼 덩이를 만든다. */
function groupByType(pins: Pin[]): { type: PinType; pins: Pin[] }[] {
  const groups: { type: PinType; pins: Pin[] }[] = [];
  for (const pin of pins) {
    const same = groups.find((g) => g.type === pin.type);
    if (same) same.pins.push(pin);
    else groups.push({ type: pin.type, pins: [pin] });
  }
  return groups;
}

/** 찾아온 장소들 — 종류별로 묶어 보여 주고, 안 꽂힌 게 여럿이면 한 번에 꽂는 단추를 단다. */
function PlaceSection({
  pins,
  pinnedIds,
  onPin,
}: {
  pins: Pin[];
  pinnedIds: ReadonlySet<string>;
  onPin: (pins: Pin[]) => void;
}) {
  const groups = useMemo(() => groupByType(pins), [pins]);
  const unpinned = pins.filter((p) => !pinnedIds.has(p.id));
  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-2 px-0.5">
        <span className="text-xs font-bold text-[var(--text-muted)]">찾은 곳 {pins.length}</span>
        {unpinned.length >= 2 && (
          <button
            type="button"
            onClick={() => onPin(unpinned)}
            className="press ml-auto flex h-7 items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 text-[11px] font-bold text-[var(--accent)] transition-colors duration-200 hover:bg-[var(--accent-bg)]"
          >
            <PinIcon size={11} strokeWidth={2.6} aria-hidden />
            {unpinned.length}곳 모두 꽂기
          </button>
        )}
      </div>
      {groups.map((g, gi) => {
        const cfg = PIN_TYPES[g.type];
        return (
          <div key={g.type} className={gi > 0 ? "mt-2.5" : undefined}>
            {groups.length > 1 && (
              <p className="mb-1 flex items-center gap-1.5 px-0.5 text-[11px] font-bold text-[var(--text-faint)]">
                <cfg.Icon size={12} strokeWidth={2.4} style={{ color: cfg.color }} aria-hidden />
                {cfg.label} {g.pins.length}
              </p>
            )}
            <ul className="flex flex-col gap-1.5">
              {g.pins.map((pin) => (
                <CandidateCard
                  key={pin.id}
                  pin={pin}
                  pinned={pinnedIds.has(pin.id)}
                  onPin={() => onPin([pin])}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** 장소 카드가 하나도 없을 때만 쓰는 근거 줄 — 붙일 카드가 없어 답 아래에 접어 둔다. */
function MessageSources({ sources }: { sources: AssistantSource[] }) {
  const [open, setOpen] = useState(false);
  const shown = sources.slice(0, MAX_SHOWN_SOURCES);
  return (
    <div className="w-full overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)]">
      <div className="flex items-center px-1.5 py-0.5">
        <SourceToggle
          count={shown.length}
          open={open}
          onToggle={() => setOpen((v) => !v)}
          label="참고한 글"
        />
      </div>
      {open && <SourceRail sources={shown} />}
    </div>
  );
}

/** 답변 글 — 요약 한 줄과 점 목록만 펴 두고, 남은 설명은 "더 보기"로 접는다. */
function AnswerText({ text, danger }: { text: string; danger: boolean }) {
  const [open, setOpen] = useState(false);
  const { head, bullets, rest } = useMemo(() => splitAnswer(text), [text]);
  // 실패 안내는 짧고 통째로 읽혀야 한다 — 나누지 않고 그대로 보여 준다.
  if (danger) return <p className="whitespace-pre-wrap">{text}</p>;
  return (
    <>
      {head && <p className="text-sm font-semibold leading-relaxed text-[var(--text)]">{head}</p>}
      {bullets.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {bullets.map((b, i) => (
            <li
              key={i}
              className="flex gap-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]"
            >
              <span
                className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--accent-ink)]"
                aria-hidden
              />
              <span className="min-w-0">{b}</span>
            </li>
          ))}
        </ul>
      )}
      {rest && open && (
        <p className="anim-reveal mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">
          {rest}
        </p>
      )}
      {rest && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="press mt-1 flex h-7 items-center gap-1 rounded-full text-[11px] font-bold text-[var(--text-faint)] transition-colors duration-200 hover:text-[var(--accent)]"
        >
          <ChevronDown
            size={13}
            strokeWidth={2.6}
            className={`transition-transform duration-150${open ? " rotate-180" : ""}`}
            aria-hidden
          />
          {open ? "접기" : "더 보기"}
        </button>
      )}
    </>
  );
}

export default function AssistantPanel({
  messages,
  loading,
  pinnedIds,
  onSend,
  onPin,
}: AssistantPanelProps) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 새 말이 붙으면 맨 아래로 따라 내려간다
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const submit = () => {
    const text = draft.trim();
    if (!text || loading) return;
    setDraft("");
    onSend(text);
  };

  // 실패했을 때 "다시 물어보기" — 마지막으로 보낸 부탁을 그대로 한 번 더 보낸다.
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.text ?? "";

  // 아직 한 마디도 안 나눈 상태 — 리스트 화면과 같은 문법(그림 하나 + 한 줄)으로 둔다.
  const empty = messages.length === 0 && !loading;

  return (
    <div className="flex h-full flex-col">
      {empty ? (
        // 위아래가 통째로 빈 화면이라 글자를 가운데(눈으로 보는 가운데는 살짝 위)에 앉힌다.
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-10">
          <div className="dw-empty">
            <span className="dw-empty-art" aria-hidden>
              <MessageCircleQuestionMark size={30} strokeWidth={1.8} />
            </span>
            <span className="dw-empty-title">어디가 좋을지 물어보세요</span>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
          <ul className="flex flex-col gap-2.5 pb-3">
            {messages.map((m, i) => {
              const hasPins = Boolean(m.pins && m.pins.length > 0);
              const showRetry = Boolean(
                m.isError && !loading && i === messages.length - 1 && lastUserText
              );
              if (m.role === "user") {
                return (
                  <li key={i} className="flex justify-end">
                    <div className="msg-in-me max-w-[85%] rounded-[var(--radius-card)] rounded-br-[6px] bg-[var(--accent)] px-3.5 py-2.5 text-sm leading-relaxed text-white">
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>
                  </li>
                );
              }
              return (
                <li key={i} className="flex flex-col items-start gap-2">
                  {m.text && (
                    <div
                      className={`msg-in-ai max-w-[92%] rounded-[var(--radius-card)] rounded-bl-[6px] bg-[var(--surface)] px-3.5 py-2.5 text-sm leading-relaxed shadow-[var(--shadow-1)] ${
                        m.isError ? "text-[var(--danger)]" : "text-[var(--text)]"
                      }`}
                    >
                      <AnswerText text={m.text} danger={Boolean(m.isError)} />
                      {showRetry && (
                        <button
                          type="button"
                          onClick={() => onSend(lastUserText)}
                          className="mt-2 flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          <RotateCcw size={12} strokeWidth={2.5} aria-hidden />
                          다시 물어보기
                        </button>
                      )}
                    </div>
                  )}

                  {hasPins && (
                    <PlaceSection pins={m.pins!} pinnedIds={pinnedIds} onPin={onPin} />
                  )}

                  {!hasPins && m.sources && m.sources.length > 0 && (
                    <MessageSources sources={m.sources} />
                  )}
                </li>
              );
            })}
            {loading && (
              <li className="flex justify-start">
                <LoadingBubble />
              </li>
            )}
          </ul>
          <div ref={bottomRef} />
        </div>
      )}

      {/* 종이 바닥 위에 흰 알약 입력칸만 — 위 여행 알약과 같은 문법이라 배경이 끊기지 않는다 */}
      <div className="shrink-0 px-4 pb-3 pt-2.5">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // 한글 조합 중 엔터는 무시 — 조합 확정 엔터로 두 번 보내지는 것 방지
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
            placeholder="비서에게 부탁하기…"
            className="dw-input dw-input--sm dw-input--pill min-w-0 flex-1"
            aria-label="비서에게 보낼 말"
          />
          <button
            type="button"
            onClick={submit}
            disabled={loading || draft.trim().length === 0}
            className="dw-btn-primary h-11 w-11 min-h-0 shrink-0 rounded-full p-0"
            aria-label="보내기"
          >
            <ArrowUp size={19} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
}
