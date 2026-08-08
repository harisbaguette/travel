"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ExternalLink } from "lucide-react";
import type { Pin } from "@/lib/types";

// 비서 화면 — AI에게 채팅으로 시키는 곳.
// 지도는 손으로 꽂고, 여기서는 "다낭 맛집 찾아줘"처럼 말로 부탁한다.

/** 답변의 근거가 된 블로그 글 — 화면 아래 "출처" 줄에 그대로 보여 준다. */
export interface AssistantSource {
  title: string;
  url: string;
  blogger?: string;
}

export interface AssistantMsg {
  role: "user" | "assistant";
  text: string;
  /** AI가 찾아온 핀 후보 — "골라서 꽂기" 단추로 시트를 연다 */
  pins?: Pin[];
  /** 근거로 삼은 블로그 글 목록 */
  sources?: AssistantSource[];
  /** 실패 안내 등 — 회색이 아닌 경고 톤으로 보여준다 */
  isError?: boolean;
}

interface AssistantPanelProps {
  messages: AssistantMsg[];
  loading: boolean;
  onSend: (text: string) => void;
  onPickPins: (pins: Pin[]) => void;
}

const MAX_SHOWN_SOURCES = 6;

export default function AssistantPanel({
  messages,
  loading,
  onSend,
  onPickPins,
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

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
        <ul className="flex flex-col gap-2.5 pb-3">
          {messages.map((m, i) => (
            <li key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-[var(--radius-card)] px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-[var(--accent)] text-white"
                    : m.isError
                      ? "border border-[var(--border-strong)] text-[var(--danger)]"
                      : "border border-[var(--border-strong)] text-[var(--text)]"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>

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

                {m.pins && m.pins.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onPickPins(m.pins!)}
                    className="mt-2.5 w-full rounded-[var(--radius-control)] border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--accent)] transition-colors hover:border-[var(--accent)]"
                  >
                    {m.pins.length}곳 골라서 꽂기
                  </button>
                )}
              </div>
            </li>
          ))}
          {loading && (
            <li className="flex justify-start">
              <div className="flex items-center gap-2 rounded-[var(--radius-card)] border border-[var(--border-strong)] px-3.5 py-2.5 text-sm text-[var(--text-muted)]">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
                후기 찾는 중…
              </div>
            </li>
          )}
        </ul>
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-4 pb-3 pt-1.5">
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
            className="dw-input dw-input--sm min-w-0 flex-1"
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
