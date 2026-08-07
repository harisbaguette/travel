"use client";

import { useMemo } from "react";
import type { Itinerary, Pin } from "@/lib/types";

interface ItineraryPanelProps {
  pins: Pin[];
  itinerary: Itinerary;
  onChange: (it: Itinerary) => void;
  onPinClick: (pin: Pin) => void;
}

// 날짜 범위가 실수로 너무 길어져도 카드가 무한히 생기지 않도록 막는 상한.
const MAX_DAYS = 60;

// "YYYY-MM-DD" 문자열 하루 더하기 — UTC 기준이라 시간대 때문에 날짜가 밀리지 않음.
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86400000);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function weekdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAYS[d.getUTCDay()];
}

export default function ItineraryPanel({
  pins,
  itinerary,
  onChange,
  onPinClick,
}: ItineraryPanelProps) {
  // 시작·종료일로 날짜 카드 목록을 만든다. 저장된 배정(pinIds)은 날짜로 이어 붙인다.
  const dayList = useMemo(() => {
    const { startDate, endDate, days } = itinerary;
    if (!startDate) return [];
    const span = endDate ? daysBetween(startDate, endDate) : 0;
    if (span < 0) return [];
    const count = Math.min(span + 1, MAX_DAYS);
    const byDate = new Map(days.map((d) => [d.date, d.pinIds]));
    return Array.from({ length: count }, (_, i) => {
      const date = addDays(startDate, i);
      return { date, pinIds: byDate.get(date) ?? [] };
    });
  }, [itinerary]);

  const pinById = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);

  // 화면에 보이는 날짜 어디에도 안 들어간 핀 — "이 날짜에 추가" 목록에 띄운다.
  // 날짜 범위를 줄여 사라진 날에 묶여 있던 핀도 다시 고를 수 있어야 하므로 dayList 기준으로 센다.
  const unassigned = useMemo(() => {
    const used = new Set(dayList.flatMap((d) => d.pinIds));
    return pins.filter((p) => !used.has(p.id));
  }, [pins, dayList]);

  const setRange = (patch: Partial<Pick<Itinerary, "startDate" | "endDate">>) => {
    onChange({ ...itinerary, ...patch });
  };

  const assign = (date: string, pinId: string) => {
    if (!pinId) return;
    const days = [...itinerary.days];
    const idx = days.findIndex((d) => d.date === date);
    if (idx === -1) {
      days.push({ date, pinIds: [pinId] });
    } else {
      if (days[idx].pinIds.includes(pinId)) return;
      days[idx] = { ...days[idx], pinIds: [...days[idx].pinIds, pinId] };
    }
    onChange({ ...itinerary, days });
  };

  const unassign = (date: string, pinId: string) => {
    const days = itinerary.days
      .map((d) =>
        d.date === date
          ? { ...d, pinIds: d.pinIds.filter((id) => id !== pinId) }
          : d
      )
      .filter((d) => d.pinIds.length > 0);
    onChange({ ...itinerary, days });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      {/* 날짜 고르기 */}
      <div className="shrink-0 border-b border-[var(--border)] p-4">
        <div className="flex items-center gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">시작일</span>
            <input
              type="date"
              value={itinerary.startDate}
              max={itinerary.endDate || undefined}
              onChange={(e) => setRange({ startDate: e.target.value })}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">종료일</span>
            <input
              type="date"
              value={itinerary.endDate}
              min={itinerary.startDate || undefined}
              onChange={(e) => setRange({ endDate: e.target.value })}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* Day 카드 */}
      <div className="flex-1 overflow-y-auto p-3">
        {dayList.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="text-6xl">📅</span>
            <span className="text-sm text-[var(--text-muted)]">
              시작일과 종료일을 고르면
              <br />
              날짜별 계획표가 만들어져요
            </span>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {dayList.map((day, i) => (
              <li
                key={day.date}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-sm font-bold text-[var(--accent)]">
                    Day {i + 1}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {day.date} ({weekdayOf(day.date)})
                  </span>
                </div>

                {day.pinIds.length > 0 && (
                  <ol className="mb-2 flex flex-col gap-1">
                    {day.pinIds.map((pid, order) => {
                      const pin = pinById.get(pid);
                      if (!pin) return null;
                      return (
                        <li
                          key={pid}
                          className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-[var(--surface-hover)]"
                        >
                          <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-[var(--text-muted)]">
                            {order + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => onPinClick(pin)}
                            className="flex flex-1 items-center gap-1.5 overflow-hidden text-left"
                          >
                            <span className="shrink-0 text-sm">{pin.emoji}</span>
                            <span className="truncate text-sm text-[var(--text)]">
                              {pin.name}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => unassign(day.date, pid)}
                            className="shrink-0 rounded p-0.5 text-xs text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
                            aria-label={`${pin.name} 이 날짜에서 빼기`}
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {unassigned.length > 0 ? (
                  <select
                    value=""
                    onChange={(e) => {
                      assign(day.date, e.target.value);
                      e.target.value = "";
                    }}
                    className="h-9 w-full rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                    aria-label={`${day.date}에 핀 추가`}
                  >
                    <option value="">+ 이 날짜에 추가</option>
                    {unassigned.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.emoji} {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  day.pinIds.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)]">
                      배정할 핀이 없어요 — 지도에 핀을 먼저 꽂아보세요
                    </p>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
