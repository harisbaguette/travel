"use client";

import { useState } from "react";
import {
  ArrowRight,
  BedDouble,
  ChevronDown,
  MapPin,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  X,
} from "lucide-react";
import type { FlightInfo, Itinerary, StayInfo } from "@/lib/types";
import { EMPTY_FLIGHT } from "@/lib/types";
import { addDays, daysBetween, shortDate, weekdayOf } from "@/lib/dates";
import { looksLikeMapLink, mapHrefForText } from "@/lib/mapLinks";

interface TravelInfoPanelProps {
  itinerary: Itinerary;
  onChange: (it: Itinerary) => void;
  /** 항공 칸만 볼지 숙소 칸만 볼지 — 준비 화면이 둘을 따로 보여 준다. */
  part: "flights" | "stays";
  /** 숙소 칸에 구글 지도 링크를 붙여넣었을 때 — 지도에 핀을 꽂고 이름을 채워 준다. */
  onStayMapLink?: (stayId: string, url: string) => void;
}

// 여행 기록 — 비행(가는/오는 편) + 숙소. 종이 배경 위 흰 카드(DW 문법).
// 비행 날짜는 여행 날짜와 별개 — 여행 날짜는 일정 화면에서 따로 정한다
// (전날 밤 출발·다음 날 새벽 도착처럼 비행이 여행의 시작·끝과 다를 수 있어서).
export default function TravelInfoPanel({
  itinerary,
  onChange,
  part,
  onStayMapLink,
}: TravelInfoPanelProps) {
  const patchFlight = (key: "outbound" | "inbound", patch: Partial<FlightInfo>) => {
    const cur = itinerary[key] ?? { ...EMPTY_FLIGHT };
    onChange({ ...itinerary, [key]: { ...cur, ...patch } });
  };

  const stays = itinerary.stays ?? [];

  // 숙소 카드 접었다 폈다 — 기본은 펼침. 한 번 만지면 그 뒤로 그 상태를 기억한다.
  const [openStays, setOpenStays] = useState<Record<string, boolean>>({});
  const isStayOpen = (id: string) => openStays[id] !== false;
  const toggleStay = (id: string) =>
    setOpenStays((cur) => ({ ...cur, [id]: !isStayOpen(id) }));

  const addStay = () => {
    const stay: StayInfo = {
      id: `stay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "",
      checkIn: "",
      checkOut: "",
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

  // 주소 칸에 구글 지도 링크가 들어오면(붙여넣기, 또는 다 적고 칸을 벗어날 때)
  // 위(page)에 알려 지도에 핀을 꽂게 한다. 이미 그 링크로 꽂았으면 다시 안 꽂는다.
  const tryStayLink = (s: StayInfo, value: string) => {
    if (!onStayMapLink) return;
    const t = value.trim();
    if (!t || !looksLikeMapLink(t)) return;
    if (s.pinId && t === (s.address ?? "").trim()) return;
    onStayMapLink(s.id, t);
  };

  // 여행 기간의 날짜 목록 — 숙소 날짜를 "몇 일차"로 고르게 해 준다.
  // 여행 날짜를 아직 안 정했으면 빈 목록이 되고, 그때는 달력 칸으로 대신 적는다.
  const tripDays: string[] = [];
  if (itinerary.startDate) {
    const span = itinerary.endDate
      ? Math.max(daysBetween(itinerary.startDate, itinerary.endDate), 0)
      : 0;
    for (let i = 0; i <= span; i++) tripDays.push(addDays(itinerary.startDate, i));
  }
  const dayLabel = (d: string) => `${shortDate(d)}(${weekdayOf(d)})`;
  // 여행 날짜를 나중에 바꾸면 예전에 적어 둔 숙소 날짜가 목록 밖으로 밀려난다.
  // 그 값이 조용히 사라진 것처럼 보이지 않게, 밀려난 날짜도 한 줄로 보여 준다.
  const outsideOption = (cur: string) =>
    cur && !tripDays.includes(cur) ? (
      <option value={cur}>여행 밖 · {shortDate(cur)}</option>
    ) : null;

  if (part === "flights") {
    return (
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
      </div>
    );
  }

  return (
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
      {stays.length === 0 ? null : (
        <ul className="flex flex-col gap-3">
          {stays.map((s) => {
            const open = isStayOpen(s.id);
            const summary =
              s.checkIn || s.checkOut
                ? `${s.checkIn ? shortDate(s.checkIn) : "?"} ~ ${s.checkOut ? shortDate(s.checkOut) : "?"}`
                : "";
            return (
            <li key={s.id} className="rounded-[12px] bg-[var(--bg)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleStay(s.id)}
                  aria-expanded={open}
                  aria-label={open ? `${s.name || "숙소"} 접기` : `${s.name || "숙소"} 펼치기`}
                  className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors duration-200 hover:bg-[var(--surface-hover)]"
                >
                  <ChevronDown
                    size={16}
                    strokeWidth={2.4}
                    className={`transition-transform duration-150${open ? " rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                <input
                  type="text"
                  value={s.name}
                  onChange={(e) => patchStay(s.id, { name: e.target.value })}
                  placeholder="숙소 이름"
                  className="dw-input dw-input--sm min-w-0 flex-1"
                />
                {!open && summary && (
                  <span className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">
                    {summary}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeStay(s.id)}
                  className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors duration-200 hover:bg-[var(--surface-hover)] hover:text-[var(--danger)]"
                  aria-label={`${s.name || "숙소"} 삭제`}
                >
                  <X size={16} strokeWidth={2.2} />
                </button>
              </div>
              {open && (
              <>
              {/* 들어가는 날 — 여행 날짜를 정했으면 몇 일차로, 아니면 달력으로 고른다. 시각까지 함께. */}
              <div className="mb-2 flex items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                    들어가는 날 (체크인)
                  </span>
                  {tripDays.length > 0 ? (
                    <select
                      value={s.checkIn}
                      onChange={(e) => patchStay(s.id, { checkIn: e.target.value })}
                      className="dw-input dw-input--sm text-xs"
                    >
                      <option value="">고르기</option>
                      {outsideOption(s.checkIn)}
                      {tripDays.map((d, i) => (
                        <option key={d} value={d}>
                          {i + 1}일차 {dayLabel(d)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="date"
                      value={s.checkIn}
                      onChange={(e) => patchStay(s.id, { checkIn: e.target.value })}
                      className="dw-input dw-input--sm text-xs"
                    />
                  )}
                </label>
                {/* w-24로는 "오후 12:00"이 잘려 시각이 안 보였다 — 한국어 표기 폭만큼 넓힌다. */}
                <label className="flex w-28 shrink-0 flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">시각</span>
                  <input
                    type="time"
                    value={s.checkInTime ?? ""}
                    onChange={(e) => patchStay(s.id, { checkInTime: e.target.value })}
                    className="dw-input dw-input--sm text-xs tabular-nums"
                    aria-label="체크인 시각"
                  />
                </label>
              </div>
              {/* 나오는 날 — 들어가는 날보다 앞서지 못하게 막는다. */}
              <div className="mb-2 flex items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                    나오는 날 (체크아웃)
                  </span>
                  {tripDays.length > 0 ? (
                    <select
                      value={s.checkOut}
                      onChange={(e) => patchStay(s.id, { checkOut: e.target.value })}
                      className="dw-input dw-input--sm text-xs"
                    >
                      <option value="">고르기</option>
                      {outsideOption(s.checkOut)}
                      {tripDays.map((d, i) => (
                        <option key={d} value={d} disabled={!!s.checkIn && d <= s.checkIn}>
                          {i + 1}일차 {dayLabel(d)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="date"
                      value={s.checkOut}
                      min={s.checkIn || undefined}
                      onChange={(e) => patchStay(s.id, { checkOut: e.target.value })}
                      className="dw-input dw-input--sm text-xs"
                    />
                  )}
                </label>
                <label className="flex w-28 shrink-0 flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">시각</span>
                  <input
                    type="time"
                    value={s.checkOutTime ?? ""}
                    onChange={(e) => patchStay(s.id, { checkOutTime: e.target.value })}
                    className="dw-input dw-input--sm text-xs tabular-nums"
                    aria-label="체크아웃 시각"
                  />
                </label>
              </div>
              {/* 주소 — 적어 두면 옆 단추로 구글 지도에서 바로 열린다. */}
              <div className="mb-2 flex items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                    구글 지도 주소
                  </span>
                  <input
                    type="text"
                    value={s.address ?? ""}
                    onChange={(e) => patchStay(s.id, { address: e.target.value })}
                    onPaste={(e) => tryStayLink(s, e.clipboardData.getData("text"))}
                    onBlur={(e) => tryStayLink(s, e.target.value)}
                    placeholder="공유 링크 붙여넣기 — 핀도 같이 꽂혀요"
                    className="dw-input dw-input--sm text-xs"
                  />
                </label>
                <a
                  href={mapHrefForText(s.address || s.name)}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!(s.address || s.name).trim()}
                  className={`dw-btn-ghost h-10 min-h-0 shrink-0 gap-1 px-3 text-xs${
                    (s.address || s.name).trim()
                      ? ""
                      : " pointer-events-none opacity-40"
                  }`}
                >
                  <MapPin size={14} strokeWidth={2.4} aria-hidden />
                  지도
                </a>
              </div>
              {/* 방 번호 + 메모 — 방 번호는 체크인 뒤에 받아 적는 짧은 칸. */}
              <div className="flex items-end gap-2">
                <label className="flex w-28 shrink-0 flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                    방 번호
                  </span>
                  <input
                    type="text"
                    value={s.roomNo ?? ""}
                    onChange={(e) => patchStay(s.id, { roomNo: e.target.value })}
                    placeholder="1203호"
                    className="dw-input dw-input--sm text-xs"
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                    메모
                  </span>
                  <input
                    type="text"
                    value={s.memo}
                    onChange={(e) => patchStay(s.id, { memo: e.target.value })}
                    placeholder="입장 비밀번호, 예약 번호 등"
                    className="dw-input dw-input--sm text-xs"
                  />
                </label>
              </div>
              </>
              )}
            </li>
            );
          })}
        </ul>
      )}
    </section>
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
  // 접었다 폈다 — 기본은 펼침. 접으면 노선·시각만 한 줄로 남아 카드가 짧아진다.
  const [open, setOpen] = useState(true);
  const route = flight.from || flight.to ? `${flight.from || fromPlaceholder} → ${flight.to || toPlaceholder}` : "";

  return (
    <section className="dw-card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <span className="text-[var(--accent-ink)]">{icon}</span>
        <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
        {!open && (route || flight.depTime) && (
          <span className="min-w-0 truncate text-xs font-semibold text-[var(--text-muted)]">
            · {route}
            {flight.depTime ? ` ${flight.depTime}` : ""}
          </span>
        )}
        <ChevronDown
          size={17}
          strokeWidth={2.4}
          className={`ml-auto shrink-0 text-[var(--text-muted)] transition-transform duration-150${open ? " rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">날짜</span>
              <input
                type="date"
                value={flight.date}
                onChange={(e) => onPatch({ date: e.target.value })}
                className="dw-input dw-input--sm text-xs"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">항공사</span>
              <input
                type="text"
                value={flight.airline ?? ""}
                onChange={(e) => onPatch({ airline: e.target.value })}
                placeholder="비엣젯항공"
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
          <div className="flex items-center gap-2">
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
          {/* 터미널 — 인천 T1/T2처럼 건물이 갈리는 공항용. 위 줄의 출발·도착과 세로로 짝이 맞는다. */}
          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">출발 터미널</span>
              <input
                type="text"
                value={flight.depTerminal ?? ""}
                onChange={(e) => onPatch({ depTerminal: e.target.value })}
                placeholder="T1"
                className="dw-input dw-input--sm text-xs"
              />
            </label>
            <span aria-hidden className="mt-4 w-[14px] shrink-0" />
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">도착 터미널</span>
              <input
                type="text"
                value={flight.arrTerminal ?? ""}
                onChange={(e) => onPatch({ arrTerminal: e.target.value })}
                placeholder="T2"
                className="dw-input dw-input--sm text-xs"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
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
            placeholder="메모 — 수하물, 좌석 등"
            className="dw-input dw-input--sm text-xs"
          />
        </div>
      )}
    </section>
  );
}
