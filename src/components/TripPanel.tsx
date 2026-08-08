"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, MapPin, Plane } from "lucide-react";
import type { Itinerary, Pin } from "@/lib/types";
import ItineraryPanel from "./ItineraryPanel";
import PinList from "./PinList";
import TravelInfoPanel from "./TravelInfoPanel";

interface TripPanelProps {
  pins: Pin[];
  itinerary: Itinerary;
  currentUserId: string;
  onShowOnMap: (pin: Pin) => void;
  onPinDelete: (id: string) => void;
  onItineraryChange: (it: Itinerary) => void;
}

type SectionKey = "plan" | "pins" | "info";

function nightsOf(it: Itinerary): number {
  if (!it.startDate || !it.endDate) return 0;
  const a = new Date(`${it.startDate}T00:00:00Z`).getTime();
  const b = new Date(`${it.endDate}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(Math.floor((b - a) / 86400000), 0);
}

// 여행 관리 한 화면 — 날짜별 계획·핀 목록·항공/숙소를 접었다 폈다 하며 한 곳에서 본다.
export default function TripPanel({
  pins,
  itinerary,
  currentUserId,
  onShowOnMap,
  onPinDelete,
  onItineraryChange,
}: TripPanelProps) {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    plan: true,
    pins: true,
    info: false,
  });

  const toggle = (key: SectionKey) =>
    setOpen((cur) => ({ ...cur, [key]: !cur[key] }));

  const nights = nightsOf(itinerary);
  const planned = new Set(itinerary.days.flatMap((d) => d.pinIds)).size;
  const stayCount = itinerary.stays?.length ?? 0;
  const flightCount =
    (itinerary.outbound?.flightNo ? 1 : 0) + (itinerary.inbound?.flightNo ? 1 : 0);

  const section = (
    key: SectionKey,
    Icon: typeof CalendarDays,
    title: string,
    hint: string,
    body: React.ReactNode
  ) => (
    <section className="trip-section">
      <button
        type="button"
        className="trip-section-head"
        onClick={() => toggle(key)}
        aria-expanded={open[key]}
      >
        <Icon size={17} strokeWidth={2.2} className="text-[var(--accent-ink)]" aria-hidden />
        <span className="trip-section-title">{title}</span>
        <span className="trip-section-hint">{hint}</span>
        <ChevronDown
          size={17}
          strokeWidth={2.4}
          className={`trip-section-chevron${open[key] ? " up" : ""}`}
          aria-hidden
        />
      </button>
      {open[key] && <div className="trip-section-body">{body}</div>}
    </section>
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg)] px-4 pb-6 pt-3">
      <div className="flex flex-col gap-3">
        {section(
          "plan",
          CalendarDays,
          "날짜별 계획",
          nights > 0 ? `${nights}박 ${nights + 1}일 · ${planned}곳` : "날짜 고르기",
          <ItineraryPanel
            pins={pins}
            itinerary={itinerary}
            onChange={onItineraryChange}
            onShowOnMap={onShowOnMap}
          />
        )}

        {section(
          "pins",
          MapPin,
          "꽂아 둔 곳",
          `${pins.length}곳`,
          <PinList
            pins={pins}
            currentUserId={currentUserId}
            onShowOnMap={onShowOnMap}
            onPinDelete={onPinDelete}
          />
        )}

        {section(
          "info",
          Plane,
          "항공 · 숙소",
          flightCount + stayCount > 0
            ? `비행 ${flightCount} · 숙소 ${stayCount}`
            : "아직 비어 있음",
          <TravelInfoPanel itinerary={itinerary} onChange={onItineraryChange} />
        )}
      </div>
    </div>
  );
}
