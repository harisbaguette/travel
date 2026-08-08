"use client";

import { useState } from "react";
import { CalendarDays, ListChecks, Luggage, Plane, ShoppingCart } from "lucide-react";
import type { ChecklistItem, Itinerary, Pin } from "@/lib/types";
import ChecklistCard from "./ChecklistCard";
import ItineraryPanel from "./ItineraryPanel";
import TravelInfoPanel from "./TravelInfoPanel";

interface PreparePanelProps {
  pins: Pin[];
  itinerary: Itinerary;
  onShowOnMap: (pin: Pin) => void;
  onItineraryChange: (it: Itinerary) => void;
}

type SectionKey = "plan" | "packing" | "agenda";

interface Section {
  key: SectionKey;
  Icon: typeof CalendarDays;
  label: string;
  /** 칩에 붙는 숫자 — 0이면 감춘다. */
  count: number;
  body: () => React.ReactNode;
}

// 아직 체크 안 한 개수 — 칩 숫자용(다 하면 0이 되어 숫자가 사라진다).
function todoOf(items: ChecklistItem[]): number {
  return items.filter((i) => !i.done).length;
}

// 목록 위에 붙는 작은 제목 — 한 화면에 목록이 둘 이상 쌓일 때 구분용.
function GroupTitle({ Icon, text }: { Icon: typeof CalendarDays; text: string }) {
  return (
    <h3 className="flex items-center gap-1.5 px-1 text-sm font-bold text-[var(--text)]">
      <Icon size={16} strokeWidth={2.2} aria-hidden className="text-[var(--accent-ink)]" />
      {text}
    </h3>
  );
}

// 떠나기 전에 채우는 화면 — 위 필터 줄에서 고른 한 묶음만 아래에 펼친다.
export default function PreparePanel({
  pins,
  itinerary,
  onShowOnMap,
  onItineraryChange,
}: PreparePanelProps) {
  const [active, setActive] = useState<SectionKey>("plan");

  const packing = itinerary.packing ?? [];
  const agenda = itinerary.agenda ?? [];
  const shopping = itinerary.shopping ?? [];

  const flightCount =
    (itinerary.outbound?.flightNo ? 1 : 0) + (itinerary.inbound?.flightNo ? 1 : 0);
  const stayCount = itinerary.stays?.length ?? 0;
  const planned = new Set(itinerary.days.flatMap((d) => d.pinIds)).size;

  const sections: Section[] = [
    {
      key: "plan",
      Icon: CalendarDays,
      label: "일정",
      // 비행기·숙소·날짜에 넣은 곳을 모두 합친 "적어 둔 것" 개수.
      count: flightCount + stayCount + planned,
      body: () => (
        <div className="flex flex-col gap-4">
          {/* 여행 날짜가 모든 것의 뿌리 — 숙소 날짜도 여기서 고른 날 중에서만 고른다. */}
          <div className="flex flex-col gap-2">
            <GroupTitle Icon={CalendarDays} text="여행 일정" />
            <ItineraryPanel
              pins={pins}
              itinerary={itinerary}
              onChange={onItineraryChange}
              onShowOnMap={onShowOnMap}
            />
          </div>
          <div className="flex flex-col gap-2">
            <GroupTitle Icon={Plane} text="항공" />
            <TravelInfoPanel itinerary={itinerary} onChange={onItineraryChange} part="flights" />
          </div>
          <TravelInfoPanel itinerary={itinerary} onChange={onItineraryChange} part="stays" />
        </div>
      ),
    },
    {
      key: "packing",
      Icon: Luggage,
      label: "챙기기",
      count: todoOf(packing) + todoOf(shopping),
      body: () => (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <GroupTitle Icon={Luggage} text="짐 챙기기" />
            <ChecklistCard
              items={packing}
              placeholder="챙길 것 — 예: 여권, 선크림"
              emptyText="챙길 짐을 하나씩 적어 보세요 — 챙기면 동그라미를 눌러요"
              onChange={(next) => onItineraryChange({ ...itinerary, packing: next })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <GroupTitle Icon={ShoppingCart} text="장보기" />
            <ChecklistCard
              items={shopping}
              withAssignee
              placeholder="살 것 — 예: 물, 라면"
              emptyText="살 것을 적고 담당 칸에 맡을 사람 이름을 써요"
              onChange={(next) => onItineraryChange({ ...itinerary, shopping: next })}
            />
          </div>
        </div>
      ),
    },
    {
      key: "agenda",
      Icon: ListChecks,
      label: "회의",
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
                onClick={() => setActive(s.key)}
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
