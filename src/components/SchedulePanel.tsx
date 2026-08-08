"use client";

import { useMemo, useState } from "react";
import { BedDouble, ChevronDown, Plane } from "lucide-react";
import type { FlightInfo, Itinerary, Pin } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";
import { addDays, daysBetween, shortDate, todayISO, weekdayOf } from "@/lib/dates";

interface SchedulePanelProps {
  pins: Pin[];
  itinerary: Itinerary;
  /** 지도로 옮겨 가서 그 자리를 보여준다. */
  onShowOnMap: (pin: Pin) => void;
}

// 날짜 범위가 실수로 너무 길어져도 카드가 무한히 생기지 않도록 막는 상한.
const MAX_DAYS = 60;

function hasFlight(f: FlightInfo | undefined): f is FlightInfo {
  return Boolean(f && (f.flightNo || f.from || f.to || f.depTime));
}

// 현지에서 꺼내 보는 일정표 — 고치는 칸은 없고, 일차를 눌러 그날 갈 곳만 본다.
export default function SchedulePanel({
  pins,
  itinerary,
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

  const stays = itinerary.stays ?? [];
  const outbound = hasFlight(itinerary.outbound) ? itinerary.outbound : null;
  const inbound = hasFlight(itinerary.inbound) ? itinerary.inbound : null;

  if (dayList.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-[var(--bg)] px-8 text-center">
        <span className="dw-display text-[1.375rem] text-[var(--text)]">
          아직 일정이 없어요
        </span>
        <span className="text-sm text-[var(--text-muted)]">
          준비에서 비행기나 날짜를 넣으면 일차가 생겨요
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg)] px-4 pb-6 pt-3">
      <ul className="flex flex-col gap-3">
        {dayList.map((day, i) => {
          const open = isOpen(day.date);
          const sleeping = stays.filter(
            (s) =>
              s.name && s.checkIn && s.checkOut && s.checkIn <= day.date && day.date < s.checkOut
          );
          const showOutbound = i === 0 ? outbound : null;
          const showInbound = i === dayList.length - 1 ? inbound : null;
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

                  {day.pinIds.length === 0 ? (
                    <p className="px-1 py-1 text-sm text-[var(--text-muted)]">
                      이 날은 아직 비어 있어요
                    </p>
                  ) : (
                    <ol className="relative flex flex-col">
                      {/* 세로 선 — 시각 칸(44px) + 사이 간격(12px) + 점 반지름(14px) */}
                      <span
                        aria-hidden
                        className="absolute bottom-4 left-[70px] top-4 w-px bg-[var(--border-strong)]"
                      />
                      {day.pinIds.map((pid, order) => {
                        const pin = pinById.get(pid);
                        if (!pin) return null;
                        const cfg = PIN_TYPES[pin.type];
                        return (
                          <li key={pid}>
                            <button
                              type="button"
                              onClick={() => onShowOnMap(pin)}
                              className="flex w-full items-center gap-3 py-2 text-left"
                              aria-label={`${pin.name} 지도에서 보기`}
                            >
                              <span className="w-11 shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--text-muted)]">
                                {day.times[pid] || order + 1}
                              </span>
                              <span
                                className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                                style={{ background: cfg.color }}
                                aria-hidden
                              >
                                <cfg.Icon size={14} color="#fff" />
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm font-semibold text-[var(--text)]">
                                  {pin.name}
                                </span>
                                {pin.memo && (
                                  <span className="truncate text-xs text-[var(--text-muted)]">
                                    {pin.memo}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  )}

                  {showInbound && <FlightRow flight={showInbound} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// 비행 한 줄 — 어디서 어디로, 몇 시에, 무슨 편인지.
function FlightRow({ flight }: { flight: FlightInfo }) {
  const times = [flight.depTime, flight.arrTime].filter(Boolean).join("–");
  const sub = [times, flight.flightNo].filter(Boolean).join(" · ");
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
          <span className="text-xs tabular-nums text-[var(--text-muted)]">{sub}</span>
        )}
      </span>
    </div>
  );
}
