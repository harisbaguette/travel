"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ExternalLink,
  MessageCircleQuestionMark,
  Pin as PinIcon,
  RotateCcw,
} from "lucide-react";
import type { Pin } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";
import { googleMapsUrl } from "@/lib/mapLinks";

// 비서 화면 — AI에게 채팅으로 시키는 곳.
// 퍼플렉시티처럼 답 한 편 + 근거 글 + 장소 카드가 함께 온다.
// 카드마다 꽂기 단추가 있어, 마음에 드는 곳만 골라 바로 지도에 꽂는다.

/** 답변의 근거가 된 블로그 글 — 화면 아래 "출처" 줄에 그대로 보여 준다. */
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

/** AI가 찾은 곳 하나 — 이름·주소·이유와 함께, 오른쪽 꽂기 단추로 바로 지도에 넣는다. */
function CandidateCard({
  pin,
  pinned,
  onPin,
}: {
  pin: Pin;
  pinned: boolean;
  onPin: () => void;
}) {
  const cfg = PIN_TYPES[pin.type];
  const src = pin.sources?.[0];
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
      {pin.memo && (
        <p className="pb-2 pl-[3.25rem] pr-3 text-xs leading-relaxed text-[var(--text-muted)]">
          {pin.memo}
        </p>
      )}
      <div className="flex items-center gap-3 border-t border-[var(--border)] px-2.5 py-1.5">
        {src && (
          <a
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
          >
            <span className="min-w-0 truncate underline underline-offset-2">{src.title}</span>
            <ExternalLink size={11} className="shrink-0" aria-hidden />
          </a>
        )}
        <a
          href={googleMapsUrl(pin)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex shrink-0 items-center gap-1 text-xs text-[var(--text-muted)] underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
        >
          구글 지도
          <ExternalLink size={11} aria-hidden />
        </a>
      </div>
    </li>
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
              const unpinned = hasPins ? m.pins!.filter((p) => !pinnedIds.has(p.id)) : [];
              const showRetry = Boolean(
                m.isError && !loading && i === messages.length - 1 && lastUserText
              );
              return (
                <li key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`rounded-[var(--radius-card)] px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === "user" ? "msg-in-me" : "msg-in-ai"
                    } ${hasPins ? "w-full" : "max-w-[85%]"} ${
                      m.role === "user"
                        ? "rounded-br-[6px] bg-[var(--accent)] text-white"
                        : m.isError
                          ? "rounded-bl-[6px] bg-[var(--surface)] text-[var(--danger)] shadow-[var(--shadow-1)]"
                          : "rounded-bl-[6px] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>

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

                    {hasPins && (
                      <div className="mt-2.5">
                        <ul className="flex flex-col gap-1.5">
                          {m.pins!.map((pin) => (
                            <CandidateCard
                              key={pin.id}
                              pin={pin}
                              pinned={pinnedIds.has(pin.id)}
                              onPin={() => onPin([pin])}
                            />
                          ))}
                        </ul>
                        {unpinned.length >= 2 && (
                          <button
                            type="button"
                            onClick={() => onPin(unpinned)}
                            className="press mt-2 w-full rounded-[var(--radius-control)] border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--accent)] transition-[background,border-color,transform] duration-200 hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                          >
                            {unpinned.length}곳 모두 꽂기
                          </button>
                        )}
                      </div>
                    )}

                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-2.5 border-t border-[var(--border)] pt-2">
                        <p className="text-xs text-[var(--text-faint)]">출처</p>
                        <ul className="mt-1 flex flex-col gap-2">
                          {m.sources.slice(0, MAX_SHOWN_SOURCES).map((s) => (
                            <li key={s.url} className="flex items-center gap-1.5 py-0.5">
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 truncate text-xs text-[var(--text-muted)] underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
                              >
                                {s.title}
                              </a>
                              <ExternalLink
                                size={11}
                                className="shrink-0 text-[var(--text-faint)]"
                                aria-hidden
                              />
                              {s.blogger && (
                                <span className="shrink-0 text-xs text-[var(--text-faint)]">
                                  {s.blogger}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
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
