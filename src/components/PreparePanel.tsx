"use client";

import { useState } from "react";
import type { ChecklistItem, Itinerary } from "@/lib/types";
import ChecklistCard from "./ChecklistCard";
import TravelInfoPanel from "./TravelInfoPanel";

interface PreparePanelProps {
  itinerary: Itinerary;
  onItineraryChange: (it: Itinerary) => void;
  /** 숙소 칸에 구글 지도 링크를 붙여넣었을 때 — 지도에 핀을 꽂고 이름을 채워 준다. */
  onStayMapLink?: (stayId: string, url: string, quiet?: boolean) => void;
}

type SectionKey = "flights" | "stays" | "shopping" | "packing" | "agenda";

interface Section {
  key: SectionKey;
  label: string;
  /** 칩에 붙는 숫자 — 0이면 감춘다. */
  count: number;
  body: () => React.ReactNode;
}

// 아직 체크 안 한 개수 — 칩 숫자용(다 하면 0이 되어 숫자가 사라진다).
function todoOf(items: ChecklistItem[]): number {
  return items.filter((i) => !i.done).length;
}

// 떠나기 전에 채우는 화면 — 항공·숙소·장보기·짐 챙기기·회의 다섯 묶음.
// 위 필터 줄에서 고른 한 묶음만 아래에 펼친다. 하루하루 어디 갈지는 일정 화면에서 짠다.
export default function PreparePanel({
  itinerary,
  onItineraryChange,
  onStayMapLink,
}: PreparePanelProps) {
  const [active, setActive] = useState<SectionKey>("flights");

  const packing = itinerary.packing ?? [];
  const agenda = itinerary.agenda ?? [];
  const shopping = itinerary.shopping ?? [];

  const flightCount =
    (itinerary.outbound?.flightNo ? 1 : 0) + (itinerary.inbound?.flightNo ? 1 : 0);
  const stayCount = itinerary.stays?.length ?? 0;

  // 장보기가 짐 챙기기보다 먼저 — 사 온 것을 그다음에 짐에 넣는 순서 그대로.
  const sections: Section[] = [
    {
      key: "flights",
      label: "항공",
      count: flightCount,
      body: () => (
        <TravelInfoPanel itinerary={itinerary} onChange={onItineraryChange} part="flights" />
      ),
    },
    {
      key: "stays",
      label: "숙소",
      count: stayCount,
      body: () => (
        <TravelInfoPanel
          itinerary={itinerary}
          onChange={onItineraryChange}
          part="stays"
          onStayMapLink={onStayMapLink}
        />
      ),
    },
    {
      key: "shopping",
      label: "장보기",
      count: todoOf(shopping),
      body: () => (
        <ChecklistCard
          items={shopping}
          withAssignee
          placeholder="살 것 — 예: 물, 라면"
          onChange={(next) => onItineraryChange({ ...itinerary, shopping: next })}
        />
      ),
    },
    {
      key: "packing",
      label: "챙기기",
      count: todoOf(packing),
      body: () => (
        <ChecklistCard
          items={packing}
          withAssignee
          placeholder="챙길 것 — 예: 여권, 선크림"
          onChange={(next) => onItineraryChange({ ...itinerary, packing: next })}
        />
      ),
    },
    {
      key: "agenda",
      label: "회의",
      count: todoOf(agenda),
      body: () => (
        <ChecklistCard
          items={agenda}
          withResult
          placeholder="안건 — 예: 예산 정하기"
          onChange={(next) => onItineraryChange({ ...itinerary, agenda: next })}
        />
      ),
    },
  ];

  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    // 필터 줄은 스크롤 밖(고정 머리), 내용만 아래에서 스크롤 — 예전처럼 sticky로 띄우면
    // 스크롤된 내용이 필터 위 틈으로 비쳐 겹쳐 보였다.
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <div className="shrink-0 px-4 pb-3 pt-3">
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
                {s.label}
                {s.count > 0 && <span className="prep-chip-badge">{s.count}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {/* key를 묶음 이름으로 두는 게 중요하다 — 칩을 바꿀 때마다 이 칸을 새로 만들어야
            "새로 떠오르는" 움직임이 다시 살아난다. key가 없으면 속만 갈리고 움직임은 안 난다. */}
        <div key={current.key} className="prep-body">
          {current.body()}
        </div>
      </div>
    </div>
  );
}
