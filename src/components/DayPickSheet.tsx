"use client";

import { Check, ChevronRight } from "lucide-react";
import { shortDate, weekdayOf } from "@/lib/dates";
import { useSheet } from "@/lib/useSheet";

/** 며칠째 칸 하나 — 몇 일차인지, 그날 이미 몇 곳을 넣어 뒀는지. */
export interface DayPickOption {
  date: string;
  label: string; // "1일차"
  count: number; // 그날 이미 넣어 둔 곳 수
  already: boolean; // 이 장소가 이미 그날에 들어 있는지
}

interface DayPickSheetProps {
  placeName: string;
  days: DayPickOption[];
  onPick: (date: string) => void;
  onClose: () => void;
}

// 지도에서 곳을 누르고 "일정에 넣기"를 눌렀을 때 바닥에서 올라오는 창.
// 며칠째에 넣을지만 고르면 끝 — 접힌 목록(드롭다운)에서 이름을 찾을 필요가 없다.
export default function DayPickSheet({
  placeName,
  days,
  onPick,
  onClose,
}: DayPickSheetProps) {
  useSheet(onClose);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="며칠째에 넣을지 고르기">
        <div className="sheet-handle" />
        <h2 className="mb-1 truncate text-base font-bold text-[var(--text)]">{placeName}</h2>
        <p className="mb-4 text-xs text-[var(--text-muted)]">며칠째에 넣을까요?</p>

        {days.length === 0 ? (
          <p className="rounded-[13px] bg-[var(--surface-raised)] px-3 py-4 text-sm text-[var(--text-muted)]">
            아직 여행 날짜가 없어요. 일정 화면에서 시작일과 종료일을 먼저 골라 주세요.
          </p>
        ) : (
          <ul className="flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto">
            {days.map((d) => (
              <li key={d.date}>
                <button
                  type="button"
                  onClick={() => onPick(d.date)}
                  disabled={d.already}
                  className="flex w-full items-center gap-3 rounded-[13px] bg-[var(--surface-raised)] px-3 py-3 text-left transition-transform active:scale-[0.99] disabled:opacity-45"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-bg)] text-xs font-bold tabular-nums text-[var(--accent)]">
                    {d.label.replace("일차", "")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[var(--text)]">
                      {d.label}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      {shortDate(d.date)}({weekdayOf(d.date)}) · {d.count}곳
                    </span>
                  </span>
                  {d.already ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--accent)]">
                      <Check size={14} strokeWidth={2.6} aria-hidden />
                      넣음
                    </span>
                  ) : (
                    <ChevronRight
                      size={16}
                      strokeWidth={2.4}
                      className="shrink-0 text-[var(--text-faint)]"
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="dw-btn-ghost">
            닫기
          </button>
        </div>
      </div>
    </>
  );
}
