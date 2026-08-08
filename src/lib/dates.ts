// 날짜 문자열("YYYY-MM-DD") 계산 — 준비 화면과 일정 화면이 똑같은 규칙을 쓰도록 한곳에 모았다.
// 전부 UTC 기준으로 계산해서 시간대 때문에 날짜가 하루 밀리는 일이 없다.

/** "YYYY-MM-DD"에 n일 더한 날짜 */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 두 날짜 사이의 일수(end - start). 값이 이상하면 0 */
export function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86400000);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 요일 한 글자 — "2026-08-08" → "토" */
export function weekdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAYS[d.getUTCDay()];
}

/** "8/9"처럼 짧게 — 일정 화면 머리줄용 */
export function shortDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** 이 기기의 오늘 날짜 — 여행 중이면 오늘 일차를 펼쳐 주려고 쓴다. */
export function todayISO(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
