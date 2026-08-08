"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil } from "lucide-react";
import type { Room } from "@/lib/rooms";

interface ProjectSwitcherProps {
  rooms: Room[];
  currentId: string;
  onSelect: (id: string) => void;
  onRename: (id: string, label: string) => void;
}

// 상단 여행 전환 알약 — Doweek ProjectSwitcher 문법 이식.
export default function ProjectSwitcher({
  rooms,
  currentId,
  onSelect,
  onRename,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  // 지금 여행 이름을 고쳐 쓰는 중인지
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("");
  const pillRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = rooms.find((r) => r.id === currentId) ?? rooms[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setEditing(false);
      pillRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const close = () => {
    setOpen(false);
    setEditing(false);
    setLabel("");
  };

  const submit = () => {
    const name = label.trim();
    if (!name) return;
    onRename(currentId, name);
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

            {editing ? (
              <div className="ps-new">
                <input
                  ref={inputRef}
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  placeholder="예: 다낭 맵"
                  className="dw-input dw-input--sm min-w-0 flex-1"
                  aria-label="여행 이름"
                />
                <button
                  type="button"
                  onClick={submit}
                  className="dw-btn-primary h-11 min-h-0 shrink-0 px-3 text-sm"
                >
                  바꾸기
                </button>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="ps-item"
                onClick={() => {
                  setLabel(active?.label ?? "");
                  setEditing(true);
                }}
              >
                <Pencil size={16} strokeWidth={2.2} className="ps-item-icon" />
                <span className="ps-item-name">이 여행 이름 바꾸기</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
