"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LayoutGrid, type LucideIcon } from "lucide-react";
import { PIN_TYPE_LIST } from "@/lib/pinTypes";
import type { Pin, PinType } from "@/lib/types";

interface PinTypeFilterProps {
  /** 개수를 세는 대상 — 지금 이 여행에 꽂힌 핀 전부 */
  pins: Pin[];
  value: PinType | "all";
  onChange: (v: PinType | "all") => void;
}

interface Option {
  key: PinType | "all";
  label: string;
  color: string;
  Icon: LucideIcon;
  count: number;
}

// 목록 화면 종류 고르개 — 종류가 열한 가지라 알약을 늘어놓으면 줄이 세 줄로 불어난다.
// 상단 여행 전환 알약(ProjectSwitcher)과 같은 문법의 드롭다운으로 한 줄에 담는다.
export default function PinTypeFilter({
  pins,
  value,
  onChange,
}: PinTypeFilterProps) {
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);

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

  const options: Option[] = [
    {
      key: "all",
      label: "전체",
      color: "var(--text-muted)",
      Icon: LayoutGrid,
      count: pins.length,
    },
    ...PIN_TYPE_LIST.map((cfg) => ({
      key: cfg.type,
      label: cfg.label,
      color: cfg.color,
      Icon: cfg.Icon,
      count: pins.filter((p) => p.type === cfg.type).length,
    })),
  ];
  const active = options.find((o) => o.key === value) ?? options[0];
  const ActiveIcon = active.Icon;

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
        <ActiveIcon
          size={17}
          strokeWidth={2.2}
          className="ps-item-icon"
          style={{ color: active.color }}
          aria-hidden
        />
        <span className="ps-name">{active.label}</span>
        <span className="prep-chip-badge">{active.count}</span>
        <ChevronDown
          size={15}
          strokeWidth={2.2}
          className={`ps-chevron${open ? " up" : ""}`}
        />
      </button>

      {open && (
        <>
          <div className="ps-overlay" onClick={() => setOpen(false)} />
          {/* 열한 줄이라 화면보다 길어질 수 있어 메뉴 안에서 위아래로 굴린다. */}
          <div className="ps-menu ps-menu-scroll" role="menu">
            {options.map((o) => {
              const ItemIcon = o.Icon;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="menuitem"
                  className="ps-item"
                  onClick={() => {
                    setOpen(false);
                    if (o.key !== value) onChange(o.key);
                  }}
                >
                  <ItemIcon
                    size={17}
                    strokeWidth={2.2}
                    className="ps-item-icon"
                    style={{ color: o.color }}
                    aria-hidden
                  />
                  <span className="ps-item-name">{o.label}</span>
                  {o.count > 0 && (
                    <span className="prep-chip-badge">{o.count}</span>
                  )}
                  {o.key === value && (
                    <Check size={16} strokeWidth={2.4} className="ps-check" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
