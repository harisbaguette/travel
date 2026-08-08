import type { DayPlan } from "./types";

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
