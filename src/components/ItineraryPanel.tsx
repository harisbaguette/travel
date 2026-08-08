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
    const byDate = new Map(days.map((d) => [d.date, d]));
    return Array.from({ length: count }, (_, i) => {
      const date = addDays(startDate, i);
      const saved = byDate.get(date);
      return { date, pinIds: saved?.pinIds ?? [], times: saved?.times ?? {} };
    });
  }, [itinerary]);

  const nights = useMemo(() => {
    if (!itinerary.startDate || !itinerary.endDate) return 0;
    return Math.max(daysBetween(itinerary.startDate, itinerary.endDate), 0);
  }, [itinerary.startDate, itinerary.endDate]);

  const pinById = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);

  // 화면에 보이는 날짜 어디에도 안 들어간 핀 — "이 날짜에 추가" 목록에 띄운다.
  const unassigned = useMemo(() => {
    const used = new Set(dayList.flatMap((d) => d.pinIds));
    return pins.filter((p) => !used.has(p.id));
  }, [pins, dayList]);

  const setRange = (patch: Partial<Pick<Itinerary, "startDate" | "endDate">>) => {
    onChange({ ...itinerary, ...patch });
  };

  // 날짜 하나의 저장분을 바꿔치기하는 공통 도우미
  const patchDay = (
    date: string,
    fn: (day: { pinIds: string[]; times: Record<string, string> }) => {
      pinIds: string[];
      times: Record<string, string>;
    }
  ) => {
    const days = [...itinerary.days];
    const idx = days.findIndex((d) => d.date === date);
    const cur =
      idx === -1
        ? { pinIds: [] as string[], times: {} as Record<string, string> }
        : { pinIds: [...days[idx].pinIds], times: { ...(days[idx].times ?? {}) } };
    const next = fn(cur);
    const entry = { date, pinIds: next.pinIds, times: next.times };
    if (idx === -1) days.push(entry);
    else days[idx] = entry;
    onChange({
      ...itinerary,
      days: days.filter((d) => d.pinIds.length > 0 || Object.keys(d.times ?? {}).length > 0),
    });
  };

  const assign = (date: string, pinId: string) => {
    if (!pinId) return;
    patchDay(date, (day) =>
      day.pinIds.includes(pinId) ? day : { ...day, pinIds: [...day.pinIds, pinId] }
    );
  };

  const unassign = (date: string, pinId: string) => {
    patchDay(date, (day) => {
      const times = { ...day.times };
      delete times[pinId];
      return { pinIds: day.pinIds.filter((id) => id !== pinId), times };
    });
  };

  const setTime = (date: string, pinId: string, time: string) => {
    patchDay(date, (day) => {
      const times = { ...day.times };
      if (time) times[pinId] = time;
      else delete times[pinId];
      return { ...day, times };
    });
  };

  const move = (date: string, pinId: string, dir: -1 | 1) => {
    patchDay(date, (day) => {
      const i = day.pinIds.indexOf(pinId);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= day.pinIds.length) return day;
      const pinIds = [...day.pinIds];
      [pinIds[i], pinIds[j]] = [pinIds[j], pinIds[i]];
      return { ...day, pinIds };
    });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      {/* 날짜 고르기 */}
      <div className="shrink-0 border-b border-[var(--border)] p-4">
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">시작일</span>
            <input
              type="date"
              value={itinerary.startDate}
              max={itinerary.endDate || undefined}
              onChange={(e) => setRange({ startDate: e.target.value })}
              className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">종료일</span>
            <input
              type="date"
              value={itinerary.endDate}
              min={itinerary.startDate || undefined}
              onChange={(e) => setRange({ endDate: e.target.value })}
              className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            />
          </label>
          {nights > 0 && (
            <span className="mb-2.5 shrink-0 whitespace-nowrap rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--accent)]">
              {nights}박 {nights + 1}일
            </span>
          )}
        </div>
      </div>

      {/* Day 카드 — 세로 타임라인 */}
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
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
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
                  <ol className="relative mb-2 flex flex-col">
                    {/* 세로 선 — 순번 점들을 잇는 타임라인 줄기 */}
                    <span
                      aria-hidden
                      className="absolute bottom-3 left-[11px] top-3 w-px bg-[var(--border)]"
                    />
                    {day.pinIds.map((pid, order) => {
                      const pin = pinById.get(pid);
                      if (!pin) return null;
                      return (
                        <li key={pid} className="group relative flex items-center gap-2 py-1">
                          <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[11px] font-bold tabular-nums text-[var(--text)]">
                            {order + 1}
                          </span>
                          <input
                            type="time"
                            value={day.times[pid] ?? ""}
                            onChange={(e) => setTime(day.date, pid, e.target.value)}
                            className="h-8 w-[4.9rem] shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1 text-xs tabular-nums text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                            aria-label={`${pin.name} 방문 시각`}
                          />
                          <button
                            type="button"
                            onClick={() => onPinClick(pin)}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          >
                            <span className="shrink-0 text-sm">{pin.emoji}</span>
                            <span className="truncate text-sm text-[var(--text)]">
                              {pin.name}
                            </span>
                          </button>
                          <span className="flex shrink-0 items-center">
                            <button
                              type="button"
                              onClick={() => move(day.date, pid, -1)}
                              disabled={order === 0}
                              className="rounded p-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
                              aria-label={`${pin.name} 위로`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => move(day.date, pid, 1)}
                              disabled={order === day.pinIds.length - 1}
                              className="rounded p-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
                              aria-label={`${pin.name} 아래로`}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => unassign(day.date, pid)}
                              className="rounded p-1 text-xs text-[var(--text-muted)] hover:text-[var(--danger)]"
                              aria-label={`${pin.name} 이 날짜에서 빼기`}
                            >
                              ✕
                            </button>
                          </span>
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
