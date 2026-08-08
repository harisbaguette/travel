"use client";

import { useState } from "react";
import {
  AlarmClock,
  BedDouble,
  CalendarDays,
  ChevronDown,
  ListChecks,
  Luggage,
  Plane,
  ShoppingCart,
} from "lucide-react";
import type { ChecklistItem, Itinerary, Pin } from "@/lib/types";
import { daysBetween } from "@/lib/dates";
import ChecklistCard from "./ChecklistCard";
import ItineraryPanel from "./ItineraryPanel";
import MeetupPanel from "./MeetupPanel";
import TravelInfoPanel from "./TravelInfoPanel";

interface PreparePanelProps {
  pins: Pin[];
  itinerary: Itinerary;
  onShowOnMap: (pin: Pin) => void;
  onItineraryChange: (it: Itinerary) => void;
}

type SectionKey =
  | "flights"
  | "plan"
  | "stays"
  | "meetup"
  | "packing"
  | "shopping"
  | "agenda";

// 체크된 개수 — 섹션 머리의 "2/5" 힌트용.
function doneOf(items: ChecklistItem[]): number {
  return items.filter((i) => i.done).length;
}

function nightsOf(it: Itinerary): number {
  if (!it.startDate || !it.endDate) return 0;
  return Math.max(daysBetween(it.startDate, it.endDate), 0);
}

// 떠나기 전에 채우는 화면 — 항공·날짜·숙소·집합·짐·장보기·안건을 접었다 폈다 한 곳에서 채운다.
export default function PreparePanel({
  pins,
  itinerary,
  onShowOnMap,
  onItineraryChange,
}: PreparePanelProps) {
  // 비행기 날짜가 여행 날짜의 뿌리라 항공 칸만 펼쳐 둔다.
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    flights: true,
    plan: false,
    stays: false,
    meetup: false,
    packing: false,
    shopping: false,
    agenda: false,
  });

  const toggle = (key: SectionKey) =>
    setOpen((cur) => ({ ...cur, [key]: !cur[key] }));

  const nights = nightsOf(itinerary);
  const planned = new Set(itinerary.days.flatMap((d) => d.pinIds)).size;
  const packing = itinerary.packing ?? [];
  const agenda = itinerary.agenda ?? [];
  const shopping = itinerary.shopping ?? [];
  const meetups = itinerary.meetups ?? [];
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
          "flights",
          Plane,
          "항공",
          flightCount > 0 ? `${flightCount}편` : "아직 비어 있음",
          <TravelInfoPanel itinerary={itinerary} onChange={onItineraryChange} part="flights" />
        )}

        {section(
          "plan",
          CalendarDays,
          "일정 설정",
          nights > 0 ? `${nights}박 ${nights + 1}일 · ${planned}곳` : "날짜 고르기",
          <ItineraryPanel
            pins={pins}
            itinerary={itinerary}
            onChange={onItineraryChange}
            onShowOnMap={onShowOnMap}
          />
        )}

        {section(
          "stays",
          BedDouble,
          "숙소",
          stayCount > 0 ? `${stayCount}곳` : "아직 비어 있음",
          <TravelInfoPanel itinerary={itinerary} onChange={onItineraryChange} part="stays" />
        )}

        {section(
          "meetup",
          AlarmClock,
          "집합 시간",
          meetups.length > 0 ? `${meetups.length}개` : "약속 잡기",
          <MeetupPanel
            meetups={meetups}
            startDate={itinerary.startDate}
            onChange={(next) => onItineraryChange({ ...itinerary, meetups: next })}
          />
        )}

        {section(
          "packing",
          Luggage,
          "짐 챙기기",
          packing.length > 0 ? `${doneOf(packing)}/${packing.length} 챙김` : "아직 비어 있음",
          <ChecklistCard
            items={packing}
            placeholder="챙길 것 — 예: 여권, 선크림"
            emptyText="챙길 짐을 하나씩 적어 보세요 — 챙기면 동그라미를 눌러요"
            onChange={(next) => onItineraryChange({ ...itinerary, packing: next })}
          />
        )}

        {section(
          "shopping",
          ShoppingCart,
          "장보기",
          shopping.length > 0 ? `${doneOf(shopping)}/${shopping.length} 샀음` : "아직 비어 있음",
          <ChecklistCard
            items={shopping}
            withAssignee
            placeholder="살 것 — 예: 물, 라면"
            emptyText="살 것을 적고 담당 칸에 맡을 사람 이름을 써요"
            onChange={(next) => onItineraryChange({ ...itinerary, shopping: next })}
          />
        )}

        {section(
          "agenda",
          ListChecks,
          "회의 안건",
          agenda.length > 0 ? `${doneOf(agenda)}/${agenda.length} 끝남` : "아직 비어 있음",
          <ChecklistCard
            items={agenda}
            placeholder="이야기할 것 — 예: 예산 정하기"
            emptyText="같이 정할 것들을 적어 두면 회의 때 빠뜨리지 않아요"
            onChange={(next) => onItineraryChange({ ...itinerary, agenda: next })}
          />
        )}
      </div>
    </div>
  );
}
