"use client";

import { useState } from "react";
import type { PinType } from "@/lib/types";
import { PIN_TYPE_LIST } from "@/lib/pinTypes";

interface PinModalProps {
  lat: number;
  lng: number;
  onAdd: (data: { type: PinType; name: string; memo: string }) => void;
  onClose: () => void;
}

export default function PinModal({ lat, lng, onAdd, onClose }: PinModalProps) {
  const [type, setType] = useState<PinType>("food");
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onAdd({ type, name: trimmedName, memo: memo.trim() });
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-[#2f2b23]/35 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="새 핀 추가"
    >
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">핀 추가</h2>
          <span className="text-xs tabular-nums text-[var(--text-muted)]">
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* 핀 종류 — 큰 이모지 + 1줄 라벨 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text)]">종류</label>
            <div className="grid grid-cols-5 gap-2">
              {PIN_TYPE_LIST.map((cfg) => {
                const selected = type === cfg.type;
                return (
                  <button
                    key={cfg.type}
                    type="button"
                    onClick={() => setType(cfg.type)}
                    className="flex flex-col items-center gap-1 rounded-lg border-2 px-1 py-3 transition-colors"
                    style={{
                      borderColor: selected ? cfg.color : "var(--border)",
                      background: selected ? `${cfg.color}14` : "var(--surface)",
                    }}
                    aria-pressed={selected}
                  >
                    <span className="text-2xl leading-none">{cfg.emoji}</span>
                    <span
                      className="text-xs font-medium"
                      style={{ color: selected ? cfg.color : "var(--text)" }}
                    >
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="pin-name" className="mb-2 block text-sm font-medium text-[var(--text)]">
              이름
            </label>
            <input
              id="pin-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 이치란 라멘"
              autoFocus
              className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </div>

          <div>
            <label htmlFor="pin-memo" className="mb-2 block text-sm font-medium text-[var(--text)]">
              메모
            </label>
            <textarea
              id="pin-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 토네코로 스페셜 추천"
              rows={3}
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-lg border border-[var(--border)] px-5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-11 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-40"
            >
              추가
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}