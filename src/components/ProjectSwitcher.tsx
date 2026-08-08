"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Link2, Plus } from "lucide-react";
import type { Room } from "@/lib/rooms";

interface ProjectSwitcherProps {
  rooms: Room[];
  currentId: string;
  onSelect: (id: string) => void;
  onCreate: (label: string) => void;
  onCopyInvite: () => void;
  /** 서버 동기화가 켜져 있을 때만 초대 링크가 뜻이 있다. */
  canInvite: boolean;
  copied: boolean;
}

// 상단 여행 전환 알약 — Doweek ProjectSwitcher 문법 이식.
export default function ProjectSwitcher({
  rooms,
  currentId,
  onSelect,
  onCreate,
  onCopyInvite,
  canInvite,
  copied,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const pillRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = rooms.find((r) => r.id === currentId) ?? rooms[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setCreating(false);
      pillRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const close = () => {
    setOpen(false);
    setCreating(false);
    setLabel("");
  };

  const submitNew = () => {
    const name = label.trim();
    if (!name) return;
    onCreate(name);
    close();
  };

  return (
    <div className="ps-bar">
      <button
        ref={pillRef}
        type="button"
        className="ps-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ps-dot" style={{ background: active?.color }} />
        <span className="ps-name">{active?.label}</span>
        <ChevronDown
          size={15}
          strokeWidth={2.2}
          className={`ps-chevron${open ? " up" : ""}`}
        />
      </button>

      {open && (
        <>
          <div className="ps-overlay" onClick={close} />
          <div className="ps-menu" role="menu">
            {rooms.map((r) => (
              <button
                key={r.id}
                type="button"
                role="menuitem"
                className="ps-item"
                onClick={() => {
                  close();
                  if (r.id !== currentId) onSelect(r.id);
                }}
              >
                <span className="ps-dot" style={{ background: r.color }} />
                <span className="ps-item-name">{r.label}</span>
                {r.id === currentId && (
                  <Check size={16} strokeWidth={2.4} className="ps-check" />
                )}
              </button>
            ))}

            <div className="ps-sep" role="separator" />

            {creating ? (
              <div className="ps-new">
                <input
                  ref={inputRef}
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitNew();
                  }}
                  placeholder="예: 다낭 맵"
                  className="dw-input dw-input--sm min-w-0 flex-1"
                  aria-label="새 여행 이름"
                />
                <button
                  type="button"
                  onClick={submitNew}
                  className="dw-btn-primary h-11 min-h-0 shrink-0 px-3 text-sm"
                >
                  만들기
                </button>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="ps-item"
                onClick={() => setCreating(true)}
              >
                <Plus size={16} strokeWidth={2.4} className="ps-item-icon" />
                <span className="ps-item-name">새 여행 만들기</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              className="ps-item"
              disabled={!canInvite}
              onClick={() => {
                onCopyInvite();
                setOpen(false);
              }}
            >
              <Link2 size={16} strokeWidth={2.2} className="ps-item-icon" />
              <span className="ps-item-name">
                {copied
                  ? "링크를 복사했어요"
                  : canInvite
                    ? "친구 초대 링크 복사"
                    : "초대는 서버 연결 뒤에 가능해요"}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
