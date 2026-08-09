"use client";

import { useMemo, useState } from "react";
import {
  ExternalLink,
  Link2,
  Map as MapIcon,
  MapPin,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Pin } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";
import { googleMapsUrl } from "@/lib/mapLinks";
import { splitMemoLines } from "@/lib/memoLines";

interface PinListProps {
  pins: Pin[];
  /** 지금 이 브라우저 사용자 ID — 내 핀/친구 핀 구분용. */
  currentUserId: string;
  /** 지도로 옮겨 가서 그 핀을 보여준다(누른 사람이 직접 고를 때만). */
  onShowOnMap: (pin: Pin) => void;
  onPinDelete: (id: string) => void;
  /** 이름·종류·메모 고치는 창을 부모가 띄운다. */
  onPinEdit?: (pin: Pin) => void;
}

// 핀 목록 — 카드 한 장 안에 줄을 쌓는다. 줄을 누르면 메모가 펼쳐지고,
// 오른쪽 지도 단추를 누르면 그 자리로 지도가 넘어간다. 지우기는 펼친 안쪽에 둔다
// (줄마다 쓰레기통을 두면 스치기만 해도 지워지고, 줄도 그만큼 좁아진다).
export default function PinList({
  pins,
  currentUserId,
  onShowOnMap,
  onPinDelete,
  onPinEdit,
}: PinListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // 근거 글은 평소엔 접어 둔다 — 고리 그림을 누른 핀 하나만 펼친다.
  const [sourceOpenId, setSourceOpenId] = useState<string | null>(null);

  const sortedPins = useMemo(
    () => [...pins].sort((a, b) => b.createdAt - a.createdAt),
    [pins]
  );

  const isMine = (pin: Pin) =>
    !pin.createdBy || !currentUserId || pin.createdBy === currentUserId;

  if (sortedPins.length === 0) {
    return (
      <div className="dw-empty">
        <span className="dw-empty-art" aria-hidden>
          <MapPin size={30} strokeWidth={1.8} />
        </span>
        <span className="dw-empty-title">아직 꽂아 둔 곳이 없어요</span>
      </div>
    );
  }

  return (
    <ul className="dw-list">
      {sortedPins.map((pin) => {
        const cfg = PIN_TYPES[pin.type];
        const mine = isMine(pin);
        const isOpen = expandedId === pin.id;
        const asking = confirmId === pin.id;
        const memoLines = splitMemoLines(pin.memo);
        const sources = pin.sources ?? [];
        const sourceOpen = sourceOpenId === pin.id;
        return (
          <li key={pin.id} className={isOpen ? "bg-[var(--surface-raised)]" : ""}>
            <div className="flex items-center pr-1 transition-colors hover:bg-[var(--surface-hover)]">
              <button
                type="button"
                onClick={() => {
                  setConfirmId(null);
                  setSourceOpenId(null);
                  setExpandedId((cur) => (cur === pin.id ? null : pin.id));
                }}
                className="dw-row min-w-0 flex-1"
                aria-expanded={isOpen}
              >
                <span
                  className={`dw-swatch${mine ? "" : " dw-swatch--other"}`}
                  style={{ "--sw": cfg.color } as React.CSSProperties}
                  aria-hidden
                >
                  <cfg.Icon size={16} strokeWidth={2.2} />
                </span>
                <span className="dw-row-name">
                  {pin.name}
                  {pin.isAI && (
                    <Sparkles
                      size={12}
                      role="img"
                      aria-label="AI 추천"
                      className="ml-[5px] inline-block align-[-1px] text-[var(--text-faint)]"
                    />
                  )}
                  {!mine && <em className="dw-tag">친구</em>}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onShowOnMap(pin)}
                className="dw-row-btn"
                aria-label={`${pin.name} 지도에서 보기`}
              >
                <MapIcon size={17} strokeWidth={2.1} />
              </button>
            </div>

            {isOpen && (
              <div className="pb-3 pl-[3.25rem] pr-3">
                {memoLines.length > 0 && (
                  <ul className="flex flex-col gap-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    {memoLines.map((line, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span
                          aria-hidden
                          className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--text-faint)]"
                        />
                        <span className="min-w-0">{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {sources.length > 0 && (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setSourceOpenId((cur) => (cur === pin.id ? null : pin.id))
                      }
                      aria-expanded={sourceOpen}
                      aria-label="추천 근거 글"
                      title="추천 근거 글"
                      className={`press flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--accent)] ${
                        sourceOpen
                          ? "bg-[var(--surface-hover)] text-[var(--accent)]"
                          : "text-[var(--text-faint)]"
                      }`}
                    >
                      <Link2 size={14} strokeWidth={2.2} aria-hidden />
                    </button>
                    {/* 접혔을 때 높이가 딱 0이 되도록 여백은 안쪽 칸에 둔다 —
                        바깥 칸에 두면 접어도 그만큼 틈이 남는다. */}
                    <div className={`dw-fold${sourceOpen ? " is-open" : ""}`}>
                      <div>
                        <div className="flex flex-col gap-1 pt-1">
                          {sources.map((source) => (
                            <a
                              key={source.url}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              tabIndex={sourceOpen ? undefined : -1}
                              className="flex items-center gap-1 text-xs text-[var(--text-faint)] transition-colors hover:text-[var(--accent)]"
                            >
                              <span className="min-w-0 truncate underline underline-offset-2">
                                {source.title}
                              </span>
                              <ExternalLink size={11} className="shrink-0" aria-hidden />
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {asking ? (
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-xs text-[var(--text-muted)]">
                      {mine ? "이 핀을 지울까요?" : "친구가 꽂은 핀이에요. 정말 지울까요?"}
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
                ) : (
                  <div className="mt-2.5 flex items-center gap-2">
                    <a
                      href={googleMapsUrl(pin)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-[12px] bg-[var(--surface-hover)] px-3 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
                    >
                      구글 지도
                      <ExternalLink size={11} className="shrink-0" aria-hidden />
                    </a>
                    {onPinEdit && (
                      <button
                        type="button"
                        onClick={() => onPinEdit(pin)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[12px] bg-[var(--surface-hover)] px-3 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
                        aria-label={`${pin.name} 수정`}
                      >
                        <Pencil size={13} strokeWidth={2.1} className="shrink-0" aria-hidden />
                        수정
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmId(pin.id)}
                      className="ml-auto dw-row-btn dw-row-btn--danger"
                      aria-label={`${pin.name} 삭제`}
                    >
                      <Trash2 size={16} strokeWidth={2.1} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
