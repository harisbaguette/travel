"use client";

import { ArrowRight, BedDouble, PlaneLanding, PlaneTakeoff, Plus, X } from "lucide-react";
import type { FlightInfo, Itinerary, StayInfo } from "@/lib/types";
import { EMPTY_FLIGHT } from "@/lib/types";

interface TravelInfoPanelProps {
  itinerary: Itinerary;
  onChange: (it: Itinerary) => void;
}

// 여행 기록 — 비행(가는/오는 편) + 숙소. 종이 배경 위 흰 카드(DW 문법).
export default function TravelInfoPanel({ itinerary, onChange }: TravelInfoPanelProps) {
  const patchFlight = (key: "outbound" | "inbound", patch: Partial<FlightInfo>) => {
    const cur = itinerary[key] ?? { ...EMPTY_FLIGHT };
    onChange({ ...itinerary, [key]: { ...cur, ...patch } });
  };

  const stays = itinerary.stays ?? [];

  const addStay = () => {
    const stay: StayInfo = {
      id: `stay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "",
      checkIn: itinerary.startDate,
      checkOut: itinerary.endDate,
      memo: "",
    };
    onChange({ ...itinerary, stays: [...stays, stay] });
  };

  const patchStay = (id: string, patch: Partial<StayInfo>) => {
    onChange({
      ...itinerary,
      stays: stays.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const removeStay = (id: string) => {
    onChange({ ...itinerary, stays: stays.filter((s) => s.id !== id) });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg)] px-4 pb-4 pt-3">
      <div className="flex flex-col gap-3">
        <FlightCard
          title="가는 편"
          icon={<PlaneTakeoff size={16} strokeWidth={2.2} aria-hidden />}
          flight={itinerary.outbound ?? EMPTY_FLIGHT}
          fromPlaceholder="인천"
          toPlaceholder="푸꾸옥"
          onPatch={(p) => patchFlight("outbound", p)}
        />
        <FlightCard
          title="오는 편"
          icon={<PlaneLanding size={16} strokeWidth={2.2} aria-hidden />}
          flight={itinerary.inbound ?? EMPTY_FLIGHT}
          fromPlaceholder="푸꾸옥"
          toPlaceholder="인천"
          onPatch={(p) => patchFlight("inbound", p)}
        />

        {/* 숙소 */}
        <section className="dw-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-[var(--text)]">
              <BedDouble size={16} strokeWidth={2.2} aria-hidden className="text-[var(--accent-ink)]" />
              숙소
            </h3>
            <button type="button" onClick={addStay} className="dw-btn-ghost h-9 min-h-0 gap-1 px-3 text-xs">
              <Plus size={14} strokeWidth={2.4} aria-hidden />
              추가
            </button>
          </div>
          {stays.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">아직 기록한 숙소가 없어요</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {stays.map((s) => (
                <li key={s.id} className="rounded-[12px] bg-[var(--bg)] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) => patchStay(s.id, { name: e.target.value })}
                      placeholder="숙소 이름"
                      className="dw-input dw-input--sm min-w-0 flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeStay(s.id)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--danger)]"
                      aria-label={`${s.name || "숙소"} 삭제`}
                    >
                      <X size={16} strokeWidth={2.2} />
                    </button>
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <label className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[11px] font-semibold text-[var(--text-muted)]">체크인</span>
                      <input
                        type="date"
                        value={s.checkIn}
                        onChange={(e) => patchStay(s.id, { checkIn: e.target.value })}
                        className="dw-input dw-input--sm text-xs"
                      />
                    </label>
                    <label className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[11px] font-semibold text-[var(--text-muted)]">체크아웃</span>
                      <input
                        type="date"
                        value={s.checkOut}
                        onChange={(e) => patchStay(s.id, { checkOut: e.target.value })}
                        className="dw-input dw-input--sm text-xs"
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={s.memo}
                    onChange={(e) => patchStay(s.id, { memo: e.target.value })}
                    placeholder="메모"
                    className="dw-input dw-input--sm text-xs"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function FlightCard({
  title,
  icon,
  flight,
  fromPlaceholder,
  toPlaceholder,
  onPatch,
}: {
  title: string;
  icon: React.ReactNode;
  flight: FlightInfo;
  fromPlaceholder: string;
  toPlaceholder: string;
  onPatch: (p: Partial<FlightInfo>) => void;
}) {
  return (
    <section className="dw-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-[var(--text)]">
        <span className="text-[var(--accent-ink)]">{icon}</span>
        {title}
      </h3>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">날짜</span>
          <input
            type="date"
            value={flight.date}
            onChange={(e) => onPatch({ date: e.target.value })}
            className="dw-input dw-input--sm text-xs"
          />
        </label>
        <label className="flex w-28 shrink-0 flex-col gap-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">편명</span>
          <input
            type="text"
            value={flight.flightNo}
            onChange={(e) => onPatch({ flightNo: e.target.value })}
            placeholder="VJ975"
            className="dw-input dw-input--sm text-xs"
          />
        </label>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">출발</span>
          <input
            type="text"
            value={flight.from}
            onChange={(e) => onPatch({ from: e.target.value })}
            placeholder={fromPlaceholder}
            className="dw-input dw-input--sm text-xs"
          />
        </label>
        <span aria-hidden className="mt-4 shrink-0 text-[var(--text-muted)]">
          <ArrowRight size={14} strokeWidth={2.2} />
        </span>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">도착</span>
          <input
            type="text"
            value={flight.to}
            onChange={(e) => onPatch({ to: e.target.value })}
            placeholder={toPlaceholder}
            className="dw-input dw-input--sm text-xs"
          />
        </label>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">출발 시각</span>
          <input
            type="time"
            value={flight.depTime}
            onChange={(e) => onPatch({ depTime: e.target.value })}
            className="dw-input dw-input--sm text-xs tabular-nums"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">도착 시각</span>
          <input
            type="time"
            value={flight.arrTime}
            onChange={(e) => onPatch({ arrTime: e.target.value })}
            className="dw-input dw-input--sm text-xs tabular-nums"
          />
        </label>
      </div>
      <input
        type="text"
        value={flight.memo}
        onChange={(e) => onPatch({ memo: e.target.value })}
        placeholder="메모"
        className="dw-input dw-input--sm text-xs"
      />
    </section>
  );
}
