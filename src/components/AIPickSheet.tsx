"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { Pin } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";
import { useSheet } from "@/lib/useSheet";

interface AIPickSheetProps {
  /** AI가 찾아온 후보들 — 아직 지도에는 꽂히지 않은 상태. */
  found: Pin[];
  onAdd: (chosen: Pin[]) => void;
  onClose: () => void;
}

// AI가 찾은 곳을 먼저 보여주고, 고른 것만 지도에 꽂는다.
// 예전에는 찾은 걸 전부 한꺼번에 밀어 넣어서 지우는 게 일이었다.
export default function AIPickSheet({ found, onAdd, onClose }: AIPickSheetProps) {
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(found.map((p) => p.id))
  );
  useSheet(onClose);

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOn = picked.size === found.length;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="AI가 찾은 곳 고르기">
        <div className="sheet-handle" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--text)]">
            {found.length}군데 찾았어요
          </h2>
          <button
            type="button"
            onClick={() =>
              setPicked(allOn ? new Set() : new Set(found.map((p) => p.id)))
            }
            className="dw-btn-ghost h-9 min-h-0 px-3 text-xs"
          >
            {allOn ? "전체 해제" : "전체 선택"}
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          마음에 드는 곳만 골라서 꽂으세요
        </p>

        <ul className="mb-4 flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto">
          {found.map((pin) => {
            const cfg = PIN_TYPES[pin.type];
            const on = picked.has(pin.id);
            return (
              <li key={pin.id}>
                <button
                  type="button"
                  onClick={() => toggle(pin.id)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-left transition-colors ${
                    on ? "bg-[var(--accent-bg)]" : "bg-[var(--surface-raised)]"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      on
                        ? "bg-[var(--accent)] text-white"
                        : "border-2 border-[var(--border-strong)] bg-[var(--surface)]"
                    }`}
                    aria-hidden
                  >
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="shrink-0" aria-hidden>
                    <cfg.Icon size={16} color={cfg.color} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-[var(--text)]">
                      {pin.name}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {cfg.label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          disabled={picked.size === 0}
          onClick={() => onAdd(found.filter((p) => picked.has(p.id)))}
          className="dw-btn-primary w-full"
        >
          {picked.size === 0 ? "고른 곳이 없어요" : `${picked.size}곳 꽂기`}
        </button>
      </div>
    </>
  );
}
