"use client";

import { useState } from "react";
import type { PinType } from "@/lib/types";
import { PIN_TYPE_LIST } from "@/lib/pinTypes";
import { useSheet } from "@/lib/useSheet";

interface PinModalProps {
  lat: number;
  lng: number;
  /** 검색 결과에서 왔을 때 미리 채워 줄 이름 */
  initialName?: string;
  /** 이미 꽂힌 핀을 고칠 때 — 종류·메모를 미리 채우고 문구를 "수정"으로 바꾼다 */
  mode?: "add" | "edit";
  initialType?: PinType;
  initialMemo?: string;
  onAdd: (data: { type: PinType; name: string; memo: string }) => void;
  onClose: () => void;
}

// 바닥에서 올라오는 입력 시트 — Doweek add-modal 문법.
// 종류는 미끄러지는 알약 탭, 입력칸은 종이 위 흰 카드 톤.
export default function PinModal({
  lat,
  lng,
  initialName,
  mode = "add",
  initialType,
  initialMemo,
  onAdd,
  onClose,
}: PinModalProps) {
  const [type, setType] = useState<PinType>(initialType ?? "food");
  const [name, setName] = useState(initialName ?? "");
  const [memo, setMemo] = useState(initialMemo ?? "");
  const editing = mode === "edit";
  useSheet(onClose);

  // 종류 칸은 3칸×2줄 격자 — 알약이 미끄러질 칸의 가로·세로 자리를 넘긴다.
  // 숙소·공항처럼 손으로 고를 수 없는 종류의 핀을 열면 짝이 없다(-1). 그럴 땐
  // 알약을 첫 칸에 두고 색만 지워, 엉뚱한 칸이 칠해지는 것을 막는다.
  const COLS = 3;
  const foundIdx = PIN_TYPE_LIST.findIndex((c) => c.type === type);
  const activeIdx = foundIdx < 0 ? 0 : foundIdx;
  const activeColor = foundIdx < 0 ? "transparent" : PIN_TYPE_LIST[foundIdx].color;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onAdd({ type, name: trimmedName, memo: memo.trim() });
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "핀 수정" : "새 핀 추가"}
      >
        <div className="sheet-handle" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--text)]">
            {editing ? "핀 수정" : "핀 추가"}
          </h2>
          <span className="text-xs tabular-nums text-[var(--text-muted)]">
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            className="cat-tabs"
            style={
              {
                "--active-col": activeIdx % COLS,
                "--active-row": Math.floor(activeIdx / COLS),
                "--tab-cols": COLS,
                "--slider-bg": activeColor,
              } as React.CSSProperties
            }
          >
            {PIN_TYPE_LIST.map((cfg) => (
              <button
                key={cfg.type}
                type="button"
                onClick={() => setType(cfg.type)}
                className={`cat-chip${type === cfg.type ? " active" : ""}`}
                style={{ "--chip-color": cfg.color } as React.CSSProperties}
                aria-pressed={type === cfg.type}
              >
                <cfg.Icon size={14} className="cat-chip-ico" aria-hidden />
                {cfg.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <input
              id="pin-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="장소 이름"
              autoFocus
              className="dw-input"
              aria-label="이름"
            />
            <textarea
              id="pin-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모"
              rows={2}
              className="dw-input resize-none"
              aria-label="메모"
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="dw-btn-ghost">
              취소
            </button>
            <button type="submit" disabled={!name.trim()} className="dw-btn-primary min-w-[72px]">
              {editing ? "저장" : "추가"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
