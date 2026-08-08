"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, MapPin, Sparkles } from "lucide-react";
import type { Pin } from "@/lib/types";

// 비서 화면 — AI에게 채팅으로 시키는 곳.
// 지도는 손으로 꽂고, 여기서는 "다낭 맛집 찾아줘"처럼 말로 부탁한다.

export interface AssistantMsg {
  role: "user" | "assistant";
  text: string;
  /** AI가 찾아온 핀 후보 — "골라서 꽂기" 단추로 시트를 연다 */
  pins?: Pin[];
  /** 실패 안내 등 — 회색이 아닌 경고 톤으로 보여준다 */
  isError?: boolean;
}

interface AssistantPanelProps {
  messages: AssistantMsg[];
  loading: boolean;
  onSend: (text: string) => void;
  onPickPins: (pins: Pin[]) => void;
  /** 지도 화면 범위에서 바로 음식점을 긁어오는 예전 기능 — AI 열쇠 없이도 동작 */
  onQuickFood: () => void;
  quickLoading: boolean;
}

const EXAMPLES = [
  "이 근처 현지인 맛집 5곳 찾아줘",
  "아이랑 가기 좋은 관광지 추천해줘",
  "분위기 좋은 카페 알려줘",
];

export default function AssistantPanel({
  messages,
  loading,
  onSend,
  onPickPins,
  onQuickFood,
  quickLoading,
}: AssistantPanelProps) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

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
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-[300px] text-center">
            <Sparkles size={28} strokeWidth={1.8} className="mx-auto text-[var(--accent)]" aria-hidden />
            <p className="dw-display mt-3 text-[1.2rem] text-[var(--text)]">비서에게 시켜 보세요</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
              맛집·관광지·카페를 말로 부탁하면 AI가 조사해서 핀 후보를 만들어 와요. 마음에 드는 곳만
              골라 꽂으면 끝.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => onSend(ex)}
                  className="rounded-[13px] bg-[var(--surface)] px-4 py-2.5 text-left text-sm text-[var(--text)] shadow-[var(--shadow-1)]"
                >
                  {ex}
                </button>
              ))}
              <button
                type="button"
                onClick={onQuickFood}
                disabled={quickLoading}
                className="rounded-[13px] bg-[var(--accent-bg)] px-4 py-2.5 text-left text-sm font-semibold text-[var(--accent)] disabled:opacity-60"
              >
                {quickLoading ? "지도에서 찾는 중…" : "🍜 지도 화면 안 음식점 바로 긁어오기"}
              </button>
            </div>
          </div>
        )}

        <ul className="flex flex-col gap-2.5 pb-3">
          {messages.map((m, i) => (
            <li key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-[16px] px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-[var(--accent)] text-white"
                    : m.isError
                      ? "bg-[var(--surface)] text-[var(--danger)] shadow-[var(--shadow-1)]"
                      : "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)]"
                }`}
              >
                {m.text}
                {m.pins && m.pins.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onPickPins(m.pins!)}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[12px] bg-[var(--accent-bg)] px-3 py-2 text-sm font-bold text-[var(--accent)]"
                  >
                    <MapPin size={15} strokeWidth={2.4} aria-hidden />
                    {m.pins.length}곳 골라서 꽂기
                  </button>
                )}
              </div>
            </li>
          ))}
          {loading && (
            <li className="flex justify-start">
              <div className="flex items-center gap-2 rounded-[16px] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--text-muted)] shadow-[var(--shadow-1)]">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
                조사하는 중… (30초쯤 걸릴 수 있어요)
              </div>
            </li>
          )}
        </ul>
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-4 pb-3 pt-1.5">
        <div className="flex items-center gap-2">
          <input
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
