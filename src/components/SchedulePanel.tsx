"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  ChevronDown,
  Map as MapIcon,
  Plane,
  X,
} from "lucide-react";
import type { FlightInfo, Itinerary, Pin } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";
import { addDays, daysBetween, shortDate, todayISO, weekdayOf } from "@/lib/dates";

interface SchedulePanelProps {
  pins: Pin[];
  itinerary: Itinerary;
  onChange: (it: Itinerary) => void;
  /** 지도로 옮겨 가서 그 자리를 보여준다. */
  onShowOnMap: (pin: Pin) => void;
}

// 날짜 범위가 실수로 너무 길어져도 카드가 무한히 생기지 않도록 막는 상한.
const MAX_DAYS = 60;

function hasFlight(f: FlightInfo | undefined): f is FlightInfo {
  return Boolean(f && (f.flightNo || f.from || f.to || f.depTime));
}

// 여행 일정 화면 — 여기서 여행 날짜를 정하고, 하루하루 갈 곳을 짠다.
// 비행 날짜와 여행 날짜는 별개(전날 밤 출발 같은 경우) — 비행은 준비 화면에서 적고,
// 날짜가 겹치는 날에 참고용 한 줄로 보여 주기만 한다.
export default function SchedulePanel({
  pins,
  itinerary,
  onChange,
  onShowOnMap,
}: SchedulePanelProps) {
  const pinById = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);

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
      const pinIds = (saved?.pinIds ?? []).filter((id) => pinById.has(id));
      return { date, pinIds, times: saved?.times ?? {} };
    });
  }, [itinerary, pinById]);

  const nights = useMemo(() => {
    if (!itinerary.startDate || !itinerary.endDate) return 0;
    return Math.max(daysBetween(itinerary.startDate, itinerary.endDate), 0);
  }, [itinerary.startDate, itinerary.endDate]);

  // 어느 날짜에도 안 들어간 핀 — "이 날짜에 추가" 목록에 띄운다.
  const unassigned = useMemo(() => {
    const used = new Set(dayList.flatMap((d) => d.pinIds));
    return pins.filter((p) => !used.has(p.id));
  }, [pins, dayList]);

  // 여행 중이면 오늘 일차를, 아니면 1일차를 펼쳐 둔다.
  const defaultDate = useMemo(() => {
    if (dayList.length === 0) return "";
    const today = todayISO();
    return dayList.some((d) => d.date === today) ? today : dayList[0].date;
  }, [dayList]);

  // 손대기 전(null)에는 위에서 고른 일차만 펼쳐진 상태로 본다.
  const [opened, setOpened] = useState<Record<string, boolean> | null>(null);
  const isOpen = (date: string) =>
    opened ? Boolean(opened[date]) : date === defaultDate;
  const toggle = (date: string) =>
    setOpened((cur) => ({
      ...(cur ?? { [defaultDate]: true }),
      [date]: !isOpen(date),
    }));

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

  const stays = itinerary.stays ?? [];
  const outbound = hasFlight(itinerary.outbound) ? itinerary.outbound : null;
  const inbound = hasFlight(itinerary.inbound) ? itinerary.inbound : null;
  // 비행 한 줄을 어느 일차에 보여줄지 — 비행 날짜가 여행 안 날짜면 그 날에,
  // 날짜를 안 적었거나 여행 밖이면 첫날(가는 편)·마지막 날(오는 편)에 참고로 붙인다.
  const flightDayIndex = (f: FlightInfo, fallback: number) => {
    const i = dayList.findIndex((d) => d.date === f.date);
    return i >= 0 ? i : fallback;
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg)] px-4 pb-6 pt-3">
      {/* 여행 날짜 — 모든 일차 카드의 뿌리. 비행 날짜와 달라도 된다. */}
      <div className="dw-card mb-3 flex items-end gap-2 p-3">
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

      {dayList.length === 0 ? (
        <p className="px-1 py-2 text-sm text-[var(--text-muted)]">
          위에서 여행 날짜를 고르면 하루하루 카드가 생겨요
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {dayList.map((day, i) => {
            const open = isOpen(day.date);
            const sleeping = stays.filter(
              (s) =>
                s.name && s.checkIn && s.checkOut && s.checkIn <= day.date && day.date < s.checkOut
            );
            const showOutbound =
              outbound && flightDayIndex(outbound, 0) === i ? outbound : null;
            const showInbound =
              inbound && flightDayIndex(inbound, dayList.length - 1) === i ? inbound : null;
            return (
              <li key={day.date} className="trip-section">
                <button
                  type="button"
                  className="trip-section-head"
                  onClick={() => toggle(day.date)}
                  aria-expanded={open}
                >
                  <span className="trip-section-title">{i + 1}일차</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    · {shortDate(day.date)}({weekdayOf(day.date)})
                  </span>
                  <span className="trip-section-hint">{day.pinIds.length}곳</span>
                  <ChevronDown
                    size={17}
                    strokeWidth={2.4}
                    className={`trip-section-chevron${open ? " up" : ""}`}
                    aria-hidden
                  />
                </button>

                {open && (
                  <div className="trip-section-body flex flex-col gap-2">
                    {showOutbound && <FlightRow flight={showOutbound} />}

                    {sleeping.length > 0 && (
                      <div className="flex flex-wrap gap-2 px-1">
                        {sleeping.map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] shadow-[var(--shadow-1)]"
                          >
                            <BedDouble
                              size={13}
                              strokeWidth={2.2}
                              className="text-[var(--accent-ink)]"
                              aria-hidden
                            />
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {day.pinIds.length > 0 && (
                      <ol className="relative flex flex-col">
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
                        <p className="px-1 text-xs text-[var(--text-muted)]">
                          지도에 핀을 꽂으면 여기에 넣을 수 있어요
                        </p>
                      )
                    )}

                    {showInbound && <FlightRow flight={showInbound} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// 비행 한 줄 — 어디서 어디로, 몇 시에, 무슨 편인지. 터미널과 항공사도 있으면 같이.
function FlightRow({ flight }: { flight: FlightInfo }) {
  const times = [flight.depTime, flight.arrTime].filter(Boolean).join("–");
  const carrier = [flight.airline, flight.flightNo].filter(Boolean).join(" ");
  const terminals = [flight.depTerminal, flight.arrTerminal].filter(Boolean).join("→");
  const sub = [times, carrier, terminals].filter(Boolean).join(" · ");
  return (
    <div className="dw-card flex items-center gap-3 p-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-bg)]"
        aria-hidden
      >
        <Plane size={16} strokeWidth={2.2} className="text-[var(--accent)]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-[var(--text)]">
          {flight.from || "출발"} → {flight.to || "도착"}
        </span>
        {sub && (
          <span className="truncate text-xs tabular-nums text-[var(--text-muted)]">{sub}</span>
        )}
      </span>
    </div>
  );
}
