"use client";

import { useState } from "react";
import {
  AlarmClock,
  BedDouble,
  CalendarDays,
  ListChecks,
  Luggage,
  Plane,
  ShoppingCart,
} from "lucide-react";
import type { ChecklistItem, Itinerary, Pin } from "@/lib/types";
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

interface Section {
  key: SectionKey;
  Icon: typeof CalendarDays;
  label: string;
  /** 칩에 붙는 숫자 — 아직 남은 것(0이면 숫자를 감춘다). */
  count: number;
  body: () => React.ReactNode;
}

// 아직 체크 안 한 개수 — 칩 숫자용(다 하면 0이 되어 숫자가 사라진다).
function todoOf(items: ChecklistItem[]): number {
  return items.filter((i) => !i.done).length;
}

// 떠나기 전에 채우는 화면 — 위 필터 줄에서 고른 한 가지만 아래에 펼친다.
export default function PreparePanel({
  pins,
  itinerary,
  onShowOnMap,
  onItineraryChange,
}: PreparePanelProps) {
  // 비행기 날짜가 여행 날짜의 뿌리라 항공부터 보여 준다.
  const [active, setActive] = useState<SectionKey>("flights");

  const packing = itinerary.packing ?? [];
  const agenda = itinerary.agenda ?? [];
  const shopping = itinerary.shopping ?? [];
  const meetups = itinerary.meetups ?? [];

  const sections: Section[] = [
    {
      key: "flights",
      Icon: Plane,
      label: "항공",
      count:
        (itinerary.outbound?.flightNo ? 1 : 0) + (itinerary.inbound?.flightNo ? 1 : 0),
      body: () => (
        <TravelInfoPanel itinerary={itinerary} onChange={onItineraryChange} part="flights" />
      ),
    },
    {
      key: "plan",
      Icon: CalendarDays,
      label: "일정 설정",
      count: new Set(itinerary.days.flatMap((d) => d.pinIds)).size,
      body: () => (
        <ItineraryPanel
          pins={pins}
          itinerary={itinerary}
          onChange={onItineraryChange}
          onShowOnMap={onShowOnMap}
        />
      ),
    },
    {
      key: "stays",
      Icon: BedDouble,
      label: "숙소",
      count: itinerary.stays?.length ?? 0,
      body: () => (
        <TravelInfoPanel itinerary={itinerary} onChange={onItineraryChange} part="stays" />
      ),
    },
    {
      key: "meetup",
      Icon: AlarmClock,
      label: "집합 시간",
      count: meetups.length,
      body: () => (
        <MeetupPanel
          meetups={meetups}
          startDate={itinerary.startDate}
          onChange={(next) => onItineraryChange({ ...itinerary, meetups: next })}
        />
      ),
    },
    {
      key: "packing",
      Icon: Luggage,
      label: "짐 챙기기",
      count: todoOf(packing),
      body: () => (
        <ChecklistCard
          items={packing}
          placeholder="챙길 것 — 예: 여권, 선크림"
          emptyText="챙길 짐을 하나씩 적어 보세요 — 챙기면 동그라미를 눌러요"
          onChange={(next) => onItineraryChange({ ...itinerary, packing: next })}
        />
      ),
    },
    {
      key: "shopping",
      Icon: ShoppingCart,
      label: "장보기",
      count: todoOf(shopping),
      body: () => (
        <ChecklistCard
          items={shopping}
          withAssignee
          placeholder="살 것 — 예: 물, 라면"
          emptyText="살 것을 적고 담당 칸에 맡을 사람 이름을 써요"
          onChange={(next) => onItineraryChange({ ...itinerary, shopping: next })}
        />
      ),
    },
    {
      key: "agenda",
      Icon: ListChecks,
      label: "회의 안건",
      count: todoOf(agenda),
      body: () => (
        <ChecklistCard
          items={agenda}
          placeholder="이야기할 것 — 예: 예산 정하기"
          emptyText="같이 정할 것들을 적어 두면 회의 때 빠뜨리지 않아요"
          onChange={(next) => onItineraryChange({ ...itinerary, agenda: next })}
        />
      ),
    },
  ];

  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg)] px-4 pb-6 pt-3">
      <div className="prep-filter-wrap">
        <div className="prep-filter">
          {sections.map((s) => {
            const on = s.key === current.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={(e) => {
                  setActive(s.key);
                  // 반쯤 잘려 있던 칩을 누르면 줄이 그 칩을 가운데로 밀어 준다.
                  e.currentTarget.scrollIntoView({
                    inline: "center",
                    block: "nearest",
                    behavior: "smooth",
                  });
                }}
                aria-pressed={on}
                className={`prep-chip${on ? " active" : ""}`}
              >
                <s.Icon size={15} strokeWidth={2.2} aria-hidden />
                {s.label}
                {s.count > 0 && <span className="prep-chip-badge">{s.count}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="prep-body">{current.body()}</div>
    </div>
  );
}
