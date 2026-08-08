"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Itinerary, Pin } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";
import ItineraryPanel from "./ItineraryPanel";
import TravelInfoPanel from "./TravelInfoPanel";

export type SidebarTab = "pins" | "itinerary" | "info";

interface SidebarProps {
  pins: Pin[];
  itinerary: Itinerary;
  /** 지금 이 브라우저 사용자 ID — 내 핀/친구 핀 구분용. */
  currentUserId: string;
  onPinClick: (pin: Pin) => void;
  onPinDelete: (id: string) => void;
  onItineraryChange: (it: Itinerary) => void;
  /** 하단 독이 정해 주는 화면. */
  tab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
  hideTabs?: boolean;
}

// 핀/일정/기록 패널 — 종이 배경 위 흰 카드(DW 문법). 화면 전환은 하단 독이 맡는다.
export default function Sidebar({
  pins,
  itinerary,
  currentUserId,
  onPinClick,
  onPinDelete,
  onItineraryChange,
  tab: controlledTab,
}: SidebarProps) {
  const [innerTab] = useState<SidebarTab>("pins");
  const tab = controlledTab ?? innerTab;
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

  if (tab === "itinerary") {
    return (
      <ItineraryPanel
        pins={pins}
        itinerary={itinerary}
        onChange={onItineraryChange}
        onPinClick={onPinClick}
      />
    );
  }

  if (tab === "info") {
    return <TravelInfoPanel itinerary={itinerary} onChange={onItineraryChange} />;
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      {/* 핀 개수 — 종류별 칩 */}
      <div className="flex shrink-0 flex-wrap gap-2 px-4 pb-2 pt-3">
        {(["food", "spot", "cafe", "stay", "etc"] as const).map((t) => {
          const n = counts[t] ?? 0;
          if (n === 0) return null;
          return (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] shadow-[var(--shadow-1)]"
            >
              <span
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: PIN_TYPES[t].color }}
                aria-hidden
              />
              {PIN_TYPES[t].label}
              <span className="tabular-nums text-[var(--text-muted)]">{n}</span>
            </span>
          );
        })}
      </div>

      {/* 핀 목록 — 흰 카드 한 장씩 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1">
        {sortedPins.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="dw-display text-[1.5625rem] text-[var(--text)]">
              아직 핀이 없어요
            </span>
            <span className="text-sm text-[var(--text-muted)]">
              지도를 누르거나 가운데 + 를 눌러 꽂아 보세요
            </span>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedPins.map((pin) => {
              const cfg = PIN_TYPES[pin.type];
              const isOpen = expandedId === pin.id;
              return (
                <li
                  key={pin.id}
                  className={`dw-card ${isMine(pin) ? "" : "border border-dashed border-[var(--border-strong)]"}`}
                >
                  <div className="flex items-center gap-2 p-3">
                    <button
                      type="button"
                      onClick={() => {
                        onPinClick(pin);
                        toggle(pin.id);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
                        style={{ background: `${cfg.color}14` }}
                      >
                        {pin.emoji}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold text-[var(--text)]">
                          {pin.name}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                          {cfg.label}
                          {pin.isAI && (
                            <span className="rounded bg-[var(--accent-bg)] px-1 font-semibold text-[var(--accent)]">
                              AI
                            </span>
                          )}
                          {!isMine(pin) && (
                            <span className="rounded bg-[var(--surface-hover)] px-1 font-semibold">
                              친구
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onPinDelete(pin.id)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--danger)]"
                      aria-label={`${pin.name} 삭제`}
                    >
                      <X size={16} strokeWidth={2.2} />
                    </button>
                  </div>
                  {isOpen && pin.memo && (
                    <p className="whitespace-pre-wrap px-3 pb-3 pl-[3.75rem] text-xs leading-relaxed text-[var(--text-muted)]">
                      {pin.memo}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
