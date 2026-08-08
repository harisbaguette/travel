"use client";

import type { FlightInfo, Itinerary, StayInfo } from "@/lib/types";
import { EMPTY_FLIGHT } from "@/lib/types";

interface TravelInfoPanelProps {
  itinerary: Itinerary;
  onChange: (it: Itinerary) => void;
}

// 여행 기록 — 비행(가는/오는 편) + 숙소. 입력하면 방 전체가 같이 본다.
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
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--surface)] p-4">
      <div className="flex flex-col gap-4">
        <FlightCard
          title="✈️ 가는 편"
          flight={itinerary.outbound ?? EMPTY_FLIGHT}
          fromPlaceholder="인천"
          toPlaceholder="푸꾸옥"
          onPatch={(p) => patchFlight("outbound", p)}
        />
        <FlightCard
          title="🛬 오는 편"
          flight={itinerary.inbound ?? EMPTY_FLIGHT}
          fromPlaceholder="푸꾸옥"
          toPlaceholder="인천"
          onPatch={(p) => patchFlight("inbound", p)}
        />

        {/* 숙소 */}
        <section className="rounded-lg border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--text)]">🛏 숙소</h3>
            <button
              type="button"
              onClick={addStay}
              className="h-8 rounded-full border border-[var(--border)] px-3 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              + 추가
            </button>
          </div>
          {stays.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">아직 기록한 숙소가 없어요</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {stays.map((s) => (
                <li key={s.id} className="rounded-lg bg-[var(--bg)] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) => patchStay(s.id, { name: e.target.value })}
                      placeholder="숙소 이름"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeStay(s.id)}
                      className="shrink-0 rounded p-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--danger)]"
                      aria-label={`${s.name || "숙소"} 삭제`}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-[11px] text-[var(--text-muted)]">체크인</span>
                      <input
                        type="date"
                        value={s.checkIn}
                        onChange={(e) => patchStay(s.id, { checkIn: e.target.value })}
                        className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-[11px] text-[var(--text-muted)]">체크아웃</span>
                      <input
                        type="date"
                        value={s.checkOut}
                        onChange={(e) => patchStay(s.id, { checkOut: e.target.value })}
                        className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={s.memo}
                    onChange={(e) => patchStay(s.id, { memo: e.target.value })}
                    placeholder="메모 (예: 조식 포함, 늦은 체크인 요청)"
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
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
  flight,
  fromPlaceholder,
  toPlaceholder,
  onPatch,
}: {
  title: string;
  flight: FlightInfo;
  fromPlaceholder: string;
  toPlaceholder: string;
  onPatch: (p: Partial<FlightInfo>) => void;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] p-3">
      <h3 className="mb-2 text-sm font-bold text-[var(--text)]">{title}</h3>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] text-[var(--text-muted)]">날짜</span>
          <input
            type="date"
            value={flight.date}
            onChange={(e) => onPatch({ date: e.target.value })}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
        <label className="flex w-28 flex-col gap-1">
          <span className="text-[11px] text-[var(--text-muted)]">편명</span>
          <input
            type="text"
            value={flight.flightNo}
            onChange={(e) => onPatch({ flightNo: e.target.value })}
            placeholder="VJ975"
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] text-[var(--text-muted)]">출발</span>
          <input
            type="text"
            value={flight.from}
            onChange={(e) => onPatch({ from: e.target.value })}
            placeholder={fromPlaceholder}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
        <span aria-hidden className="mt-4 shrink-0 text-xs text-[var(--text-muted)]">
          →
        </span>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] text-[var(--text-muted)]">도착</span>
          <input
            type="text"
            value={flight.to}
            onChange={(e) => onPatch({ to: e.target.value })}
            placeholder={toPlaceholder}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] text-[var(--text-muted)]">출발 시각</span>
          <input
            type="time"
            value={flight.depTime}
            onChange={(e) => onPatch({ depTime: e.target.value })}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs tabular-nums text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] text-[var(--text-muted)]">도착 시각</span>
          <input
            type="time"
            value={flight.arrTime}
            onChange={(e) => onPatch({ arrTime: e.target.value })}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs tabular-nums text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
      </div>
      <input
        type="text"
        value={flight.memo}
        onChange={(e) => onPatch({ memo: e.target.value })}
        placeholder="메모 (예: 수하물 15kg, 3시간 전 도착)"
        className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
      />
    </section>
  );
}
