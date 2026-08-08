"use client";

import { X } from "lucide-react";
import type { MeetupInfo } from "@/lib/types";

interface MeetupPanelProps {
  meetups: MeetupInfo[];
  onChange: (meetups: MeetupInfo[]) => void;
  /** 새 집합의 기본 날짜 — 여행 시작일이 있으면 미리 채운다. */
  startDate: string;
}

// 집합 시간 — 언제 어디서 모일지 카드로 기록한다.
export default function MeetupPanel({ meetups, onChange, startDate }: MeetupPanelProps) {
  const add = () => {
    onChange([
      ...meetups,
      {
        id: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        place: "",
        date: startDate,
        time: "",
        memo: "",
      },
    ]);
  };

  const patch = (id: string, p: Partial<MeetupInfo>) =>
    onChange(meetups.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const remove = (id: string) => onChange(meetups.filter((m) => m.id !== id));

  return (
    <div className="flex flex-col gap-3">
      {meetups.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">
          아직 잡은 약속이 없어요 — 모일 시간과 장소를 적어 두면 다 같이 볼 수 있어요
        </p>
      )}
      {meetups.length > 0 && (
        <ul className="flex flex-col gap-3">
          {meetups.map((m) => (
            <li key={m.id} className="dw-card p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="text"
                  value={m.place}
                  onChange={(e) => patch(m.id, { place: e.target.value })}
                  placeholder="어디서 모여요? 예: 호텔 로비"
                  className="dw-input dw-input--sm min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--danger)]"
                  aria-label={`${m.place || "집합"} 삭제`}
                >
                  <X size={16} strokeWidth={2.2} aria-hidden />
                </button>
              </div>
              <div className="mb-2 flex items-center gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">날짜</span>
                  <input
                    type="date"
                    value={m.date}
                    onChange={(e) => patch(m.id, { date: e.target.value })}
                    className="dw-input dw-input--sm text-xs"
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">시각</span>
                  <input
                    type="time"
                    value={m.time}
                    onChange={(e) => patch(m.id, { time: e.target.value })}
                    className="dw-input dw-input--sm text-xs tabular-nums"
                  />
                </label>
              </div>
              <input
                type="text"
                value={m.memo}
                onChange={(e) => patch(m.id, { memo: e.target.value })}
                placeholder="메모"
                className="dw-input dw-input--sm text-xs"
              />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={add}
        className="h-10 w-full rounded-[12px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] text-xs font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        + 집합 시간 추가
      </button>
    </div>
  );
}
