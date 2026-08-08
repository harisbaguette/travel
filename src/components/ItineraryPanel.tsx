"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Map as MapIcon, X } from "lucide-react";
import type { Itinerary, Pin } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";
import { addDays, daysBetween, weekdayOf } from "@/lib/dates";

interface ItineraryPanelProps {
  pins: Pin[];
  itinerary: Itinerary;
  onChange: (it: Itinerary) => void;
  /** 지도로 옮겨 가서 그 핀을 보여준다 — 지도 단추를 눌렀을 때만. */
  onShowOnMap: (pin: Pin) => void;
}

// 날짜 범위가 실수로 너무 길어져도 카드가 무한히 생기지 않도록 막는 상한.
const MAX_DAYS = 60;

export default function ItineraryPanel({
  pins,
  itinerary,
  onChange,
  onShowOnMap,
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
    <div className="flex flex-col gap-3">
      {/* 날짜 고르기 — 흰 카드 */}
      <div>
        <div className="dw-card flex items-end gap-2 p-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">시작일</span>
            <input
              type="date"
              value={itinerary.startDate}
              max={itinerary.endDate || undefined}
              onChange={(e) => setRange({ startDate: e.target.value })}
              className="dw-input dw-input--sm"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">종료일</span>
            <input
              type="date"
              value={itinerary.endDate}
              min={itinerary.startDate || undefined}
              onChange={(e) => setRange({ endDate: e.target.value })}
              className="dw-input dw-input--sm"
            />
          </label>
          {nights > 0 && (
            <span className="mb-2 shrink-0 whitespace-nowrap rounded-full bg-[var(--accent-bg)] px-2.5 py-1 text-xs font-bold text-[var(--accent)]">
              {nights}박 {nights + 1}일
            </span>
          )}
        </div>
      </div>

      {/* Day 카드 — 세로 타임라인 */}
      <div>
        {dayList.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
            <span className="dw-display text-[1.375rem] text-[var(--text)]">
              언제 떠나나요?
            </span>
            <span className="text-sm text-[var(--text-muted)]">
              시작일과 종료일을 고르면 날짜별 계획표가 만들어져요
            </span>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {dayList.map((day, i) => (
              <li key={day.date} className="dw-card p-3">
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
                      className="absolute bottom-3 left-[11px] top-3 w-px bg-[var(--border-strong)]"
                    />
                    {day.pinIds.map((pid, order) => {
                      const pin = pinById.get(pid);
                      if (!pin) return null;
                      const cfg = PIN_TYPES[pin.type];
                      return (
                        <li key={pid} className="relative flex items-center gap-2 py-1">
                          <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-bg)] text-[11px] font-bold tabular-nums text-[var(--accent)]">
                            {order + 1}
                          </span>
                          <input
                            type="time"
                            value={day.times[pid] ?? ""}
                            onChange={(e) => setTime(day.date, pid, e.target.value)}
                            className="dw-input dw-input--time shrink-0 tabular-nums text-[var(--text-muted)]"
                            aria-label={`${pin.name} 방문 시각`}
                          />
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="shrink-0" aria-hidden>
                              <cfg.Icon size={14} color={cfg.color} />
                            </span>
                            <span className="truncate text-sm text-[var(--text)]">
                              {pin.name}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center text-[var(--text-muted)]">
                            <button
                              type="button"
                              onClick={() => onShowOnMap(pin)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg hover:text-[var(--accent)]"
                              aria-label={`${pin.name} 지도에서 보기`}
                            >
                              <MapIcon size={14} strokeWidth={2.2} />
                            </button>
                            <button
                              type="button"
                              onClick={() => move(day.date, pid, -1)}
                              disabled={order === 0}
                              className="flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-30"
                              aria-label={`${pin.name} 위로`}
                            >
                              <ArrowUp size={14} strokeWidth={2.2} />
                            </button>
                            <button
                              type="button"
                              onClick={() => move(day.date, pid, 1)}
                              disabled={order === day.pinIds.length - 1}
                              className="flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-30"
                              aria-label={`${pin.name} 아래로`}
                            >
                              <ArrowDown size={14} strokeWidth={2.2} />
                            </button>
                            <button
                              type="button"
                              onClick={() => unassign(day.date, pid)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg hover:text-[var(--danger)]"
                              aria-label={`${pin.name} 이 날짜에서 빼기`}
                            >
                              <X size={14} strokeWidth={2.2} />
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
                    className="h-10 w-full rounded-[12px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 text-xs text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
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
