"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Room } from "@/lib/rooms";

interface ProjectSwitcherProps {
  rooms: Room[];
  currentId: string;
  onSelect: (id: string) => void;
}

// 상단 여행 전환 알약 — Doweek ProjectSwitcher 문법 이식.
export default function ProjectSwitcher({
  rooms,
  currentId,
  onSelect,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);

  const active = rooms.find((r) => r.id === currentId) ?? rooms[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      pillRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

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
          </div>
        </>
      )}
    </div>
  );
}
