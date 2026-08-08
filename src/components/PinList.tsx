"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Map as MapIcon, Trash2 } from "lucide-react";
import type { Pin } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";

interface PinListProps {
  pins: Pin[];
  /** 지금 이 브라우저 사용자 ID — 내 핀/친구 핀 구분용. */
  currentUserId: string;
  /** 지도로 옮겨 가서 그 핀을 보여준다(누른 사람이 직접 고를 때만). */
  onShowOnMap: (pin: Pin) => void;
  onPinDelete: (id: string) => void;
}

// 핀 목록 — 이름을 누르면 메모가 펼쳐지고, 지도로 넘어가는 건 지도 단추를 눌렀을 때만.
export default function PinList({
  pins,
  currentUserId,
  onShowOnMap,
  onPinDelete,
}: PinListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const sortedPins = useMemo(
    () => [...pins].sort((a, b) => b.createdAt - a.createdAt),
    [pins]
  );

  const isMine = (pin: Pin) =>
    !pin.createdBy || !currentUserId || pin.createdBy === currentUserId;

  if (sortedPins.length === 0) {
    return (
      <p className="px-1 py-2 text-sm text-[var(--text-muted)]">
        아직 꽂아 둔 곳이 없어요 — 지도에서 + 를 눌러 꽂아 보세요
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {sortedPins.map((pin) => {
          const cfg = PIN_TYPES[pin.type];
          const isOpen = expandedId === pin.id;
          const asking = confirmId === pin.id;
          return (
            <li
              key={pin.id}
              className={`dw-card ${isMine(pin) ? "" : "border border-dashed border-[var(--border-strong)]"}`}
            >
              <div className="flex items-center gap-1 p-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((cur) => (cur === pin.id ? null : pin.id))
                  }
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-expanded={isOpen}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: cfg.color }}
                  >
                    <cfg.Icon size={16} color="#fff" aria-hidden />
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
                  onClick={() => onShowOnMap(pin)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
                  aria-label={`${pin.name} 지도에서 보기`}
                >
                  <MapIcon size={16} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(pin.id)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--danger)]"
                  aria-label={`${pin.name} 삭제`}
                >
                  <Trash2 size={16} strokeWidth={2.2} />
                </button>
              </div>

              {asking && (
                <div className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2.5">
                  <span className="min-w-0 flex-1 text-xs text-[var(--text-muted)]">
                    {isMine(pin)
                      ? "이 핀을 지울까요?"
                      : "친구가 꽂은 핀이에요. 정말 지울까요?"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="dw-btn-ghost h-9 min-h-0 px-3 text-xs"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmId(null);
                      onPinDelete(pin.id);
                    }}
                    className="h-9 shrink-0 rounded-[12px] bg-[var(--danger)] px-3 text-xs font-bold text-white"
                  >
                    지우기
                  </button>
                </div>
              )}

              {isOpen && !asking && (
                <div className="px-3 pb-3 pl-[3.75rem]">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-muted)]">
                    {pin.memo || "적어 둔 메모가 없어요"}
                  </p>
                  {pin.sources?.[0] && (
                    <a
                      href={pin.sources[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 flex items-center gap-1 text-xs text-[var(--text-faint)] transition-colors hover:text-[var(--accent)]"
                    >
                      <span className="shrink-0">출처:</span>
                      <span className="min-w-0 truncate underline underline-offset-2">
                        {pin.sources[0].title}
                      </span>
                      <ExternalLink size={11} className="shrink-0" aria-hidden />
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
