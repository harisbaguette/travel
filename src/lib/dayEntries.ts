import type { DayPlan, Itinerary } from "./types";

// 하루 일정 줄서기 도우미 — 핀(지도 자리)과 글 항목(렌트카 받기 같은 것)을
// 한 줄로 세우는 규칙을 여기 한곳에 모았다. 일정 화면과 지도 동선이 같은 순서를 쓴다.

/** 하루의 실제 표시 순서(핀 id·글 id 섞임).
 *  order에 적힌 순서를 따르되, 빠진 항목은 뒤에 붙인다(옛 저장본은 order가 없다). */
export function dayOrder(day: Pick<DayPlan, "pinIds" | "texts" | "order">): string[] {
  const textIds = (day.texts ?? []).map((t) => t.id);
  const known = new Set([...day.pinIds, ...textIds]);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of day.order ?? []) {
    if (known.has(id) && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }
  for (const id of [...day.pinIds, ...textIds]) {
    if (!seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }
  return result;
}

/** 지워진 핀들을 하루 일정에서 빼낸다 — 순서표와 시간표에서도 함께 지워
 *  유령 자리(없는 핀의 시간만 남는 것)가 생기지 않게 한다. */
export function removePinsFromDay(day: DayPlan, deletedIds: string[]): DayPlan {
  const gone = new Set(deletedIds);
  const next: DayPlan = { ...day, pinIds: day.pinIds.filter((id) => !gone.has(id)) };
  if (day.order) next.order = day.order.filter((id) => !gone.has(id));
  if (day.times) {
    const times = { ...day.times };
    for (const id of deletedIds) delete times[id];
    next.times = times;
  }
  return next;
}

/** 하루에 남은 게 있는지 — 저장할 가치가 없는 빈 날은 지우기 위한 검사. */
export function dayHasContent(day: DayPlan): boolean {
  return (
    day.pinIds.length > 0 ||
    (day.texts?.length ?? 0) > 0 ||
    Object.keys(day.times ?? {}).length > 0
  );
}

/** 하루 칸에 자리 하나를 끼워 넣는다 — 이미 있으면 그대로, 그 날 칸이 없으면 새로 만든다. */
function withPin(days: DayPlan[], date: string, pinId: string): DayPlan[] {
  const idx = days.findIndex((d) => d.date === date);
  if (idx === -1) return [...days, { date, pinIds: [pinId], order: [pinId] }];
  if (days[idx].pinIds.includes(pinId)) return days;
  const next = [...days];
  next[idx] = {
    ...days[idx],
    pinIds: [...days[idx].pinIds, pinId],
    order: [...dayOrder(days[idx]), pinId],
  };
  return next;
}

/** 하루 칸에서 자리 하나를 빼낸다 — 순서표·시간표에서도 같이 지운다. */
function withoutPin(days: DayPlan[], date: string, pinId: string): DayPlan[] {
  const idx = days.findIndex((d) => d.date === date);
  if (idx === -1 || !days[idx].pinIds.includes(pinId)) return days;
  const next = [...days];
  next[idx] = removePinsFromDay(days[idx], [pinId]);
  return next;
}

/** 잠자리를 일정에도 올려 준다.
 *  지도 자리가 붙은 잠자리는 들어가는 날·나오는 날 칸에 그 자리가 한 줄로 들어간다.
 *  날짜를 바꾸면 옛 날짜에서 빼고 새 날짜에 넣고, 주소를 새로 넣어 자리가 바뀌면
 *  옛 자리도 걷어낸다. 손으로 지운 줄은 다시 살아나지 않는다(날짜·자리가 바뀔 때만 움직임). */
export function syncStayDays(prev: Itinerary, next: Itinerary): Itinerary {
  const before = new Map((prev.stays ?? []).map((s) => [s.id, s]));
  let days = next.days;
  // 잠자리를 통째로 지웠으면 일정에 올려 뒀던 그 줄도 같이 걷어낸다.
  const alive = new Set((next.stays ?? []).map((s) => s.id));
  for (const s of prev.stays ?? []) {
    if (alive.has(s.id) || !s.pinId) continue;
    for (const d of [s.checkIn, s.checkOut]) {
      if (d) days = withoutPin(days, d, s.pinId);
    }
  }
  for (const s of next.stays ?? []) {
    const old = before.get(s.id);
    // 주소를 다시 넣어 다른 자리가 붙었으면, 옛 자리를 옛 날짜에서 걷어낸다.
    if (old?.pinId && old.pinId !== s.pinId) {
      for (const d of [old.checkIn, old.checkOut]) {
        if (d) days = withoutPin(days, d, old.pinId);
      }
    }
    if (!s.pinId) continue;
    const samePin = old?.pinId === s.pinId;
    for (const key of ["checkIn", "checkOut"] as const) {
      const date = s[key];
      const wasDate = samePin ? old?.[key] ?? "" : "";
      if (wasDate === date) {
        // 자리가 이제 막 붙은 잠자리 — 지금 적혀 있는 날짜에 바로 넣어 준다.
        if (!samePin && date) days = withPin(days, date, s.pinId);
        continue;
      }
      // 옛 날짜가 아직 다른 쪽(들어가는 날/나오는 날)으로 쓰이면 그대로 둔다.
      const stillUsed = wasDate === s.checkIn || wasDate === s.checkOut;
      if (wasDate && !stillUsed) days = withoutPin(days, wasDate, s.pinId);
      if (date) days = withPin(days, date, s.pinId);
    }
  }
  return days === next.days ? next : { ...next, days: days.filter(dayHasContent) };
}
