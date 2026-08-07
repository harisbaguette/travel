"use client";

import { useMemo, useState } from "react";
import type { Itinerary, Pin } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";
import ItineraryPanel from "./ItineraryPanel";

interface SidebarProps {
  pins: Pin[];
  itinerary: Itinerary;
  /** 지금 이 브라우저 사용자 ID — 내 핀/친구 핀 구분용. */
  currentUserId: string;
  aiLoading: boolean;
  onAISearch: () => void;
  onPinClick: (pin: Pin) => void;
  onPinDelete: (id: string) => void;
  onItineraryChange: (it: Itinerary) => void;
}

export default function Sidebar({
  pins,
  itinerary,
  currentUserId,
  aiLoading,
  onAISearch,
  onPinClick,
  onPinDelete,
  onItineraryChange,
}: SidebarProps) {
  const [tab, setTab] = useState<"pins" | "itinerary">("pins");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of pins) {
      c[p.type] = (c[p.type] ?? 0) + 1;
    }
    return c;
  }, [pins]);

  const sortedPins = useMemo(
    () => [...pins].sort((a, b) => b.createdAt - a.createdAt),
    [pins]
  );

  const toggle = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const isMine = (pin: Pin) =>
    !pin.createdBy || !currentUserId || pin.createdBy === currentUserId;

  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      {/* 탭 — 핀 목록 / 날짜별 일정 */}
      <div className="flex shrink-0 border-b border-[var(--border)]">
        {(
          [
            { key: "pins", label: "📌 핀" },
            { key: "itinerary", label: "📅 일정" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`h-11 flex-1 text-sm font-semibold transition-colors ${
              tab === t.key
                ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
            aria-pressed={tab === t.key}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "itinerary" ? (
        <div className="flex-1 overflow-hidden">
          <ItineraryPanel
            pins={pins}
            itinerary={itinerary}
            onChange={onItineraryChange}
            onPinClick={onPinClick}
          />
        </div>
      ) : (
        <>
      {/* AI 맛집 찾기 — 단색 accent, 🤖 + 한 줄 */}
      <div className="shrink-0 border-b border-[var(--border)] p-4">
        <button
          type="button"
          onClick={onAISearch}
          disabled={aiLoading}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-sm font-bold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {aiLoading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              찾는 중…
            </>
          ) : (
            <>🤖 AI 맛집 찾기</>
          )}
        </button>
      </div>

      {/* 핀 개수 — 이모지 + 숫자만 */}
      <div className="shrink-0 flex flex-wrap gap-3 border-b border-[var(--border)] px-4 py-3">
        {(["food", "spot", "cafe", "stay", "etc"] as const).map((t) => {
          const n = counts[t] ?? 0;
          if (n === 0) return null;
          return (
            <span key={t} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text)]">
              <span className="text-base">{PIN_TYPES[t].emoji}</span>
              <span className="tabular-nums">{n}</span>
            </span>
          );
        })}
        {pins.length === 0 && (
          <span className="text-xs text-[var(--text-muted)]">아직 핀이 없어요</span>
        )}
      </div>

      {/* 핀 목록 — 이모지 + 이름, 메모는 클릭 시 펼침 */}
      <div className="flex-1 overflow-y-auto p-2">
        {sortedPins.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="text-6xl">📍</span>
            <span className="text-sm text-[var(--text-muted)]">핀을 꽂아보세요</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {sortedPins.map((pin) => {
              const cfg = PIN_TYPES[pin.type];
              const isOpen = expandedId === pin.id;
              return (
                <li
                  key={pin.id}
                  className={`group rounded-lg border transition-colors hover:bg-[var(--surface-hover)] ${
                    isMine(pin)
                      ? "border-transparent hover:border-[var(--border)]"
                      : "border-dashed border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2 p-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        onPinClick(pin);
                        toggle(pin.id);
                      }}
                      className="flex flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                        style={{ background: `${cfg.color}1f` }}
                      >
                        {pin.emoji}
                      </span>
                      <span className="flex flex-col overflow-hidden">
                        <span className="truncate text-sm font-medium text-[var(--text)]">
                          {pin.name}
                          {pin.isAI && (
                            <span className="ml-1 rounded bg-[var(--accent-soft)] px-1 text-[10px] font-medium text-[var(--accent)]">
                              AI
                            </span>
                          )}
                          {!isMine(pin) && (
                            <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-500">
                              친구
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onPinDelete(pin.id)}
                      className="shrink-0 rounded p-1 text-xs text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
                      aria-label={`${pin.name} 삭제`}
                    >
                      ✕
                    </button>
                  </div>
                  {isOpen && pin.memo && (
                    <p className="whitespace-pre-wrap px-2.5 pb-2.5 pl-[3.25rem] text-xs leading-relaxed text-[var(--text-muted)]">
                      {pin.memo}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
        </>
      )}
    </div>
  );
}