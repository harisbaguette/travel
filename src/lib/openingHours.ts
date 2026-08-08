// 가게 여는 시간 글을 사람이 읽기 좋게 바꿔 주는 도구.
// 지도 자료(OSM)의 여는 시간은 "Mo-Fr 08:00-18:00" 같은 영어 약자로 적혀 있다.
// 이것을 ① "월~금 08:00~18:00" 같은 한국어로 바꾸고, ② 그 나라 시각으로 지금
// 하고 있는지("영업 중 · 22:00에 닫아요")까지 계산해 준다.
// 읽지 못하는 형식이면 솔직하게 포기하고 원문을 그대로 보여 준다(틀린 번역보다 낫다).

const DAY_TOKENS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const; // JS getDay() 순서
const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 한국식 표기 순서: 월요일부터

/** 하루 안의 여는 구간 — 자정을 넘기면 end가 1440(24시)을 넘는다(예: 18:00~26:00). */
interface Interval {
  start: number;
  end: number;
}

export interface ParsedHours {
  /** [요일 0=일 … 6=토] → 그날의 여는 구간들. 빈 배열 = 그날 쉼. */
  table: Interval[][];
  /** 연중무휴 24시간. */
  always: boolean;
}

const DAY_RE = /^(Su|Mo|Tu|We|Th|Fr|Sa)(?:-(Su|Mo|Tu|We|Th|Fr|Sa))?$/;
const TIME_RE = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

function dayIndex(token: string): number {
  return DAY_TOKENS.indexOf(token as (typeof DAY_TOKENS)[number]);
}

// "Mo-Fr" 같은 표기를 실제 요일 번호 목록으로 편다. 주를 넘는 표기(Fr-Mo)도 돈다.
function expandDays(spec: string): number[] | null {
  const days: number[] = [];
  for (const part of spec.split(",")) {
    const m = part.trim().match(DAY_RE);
    if (!m) return null;
    const from = dayIndex(m[1]);
    const to = m[2] ? dayIndex(m[2]) : from;
    let d = from;
    for (let i = 0; i < 7; i++) {
      days.push(d);
      if (d === to) break;
      d = (d + 1) % 7;
    }
  }
  return days;
}

function parseTime(h: string, m: string): number | null {
  const hh = Number(h);
  const mm = Number(m);
  if (hh > 24 || mm > 59) return null;
  return hh * 60 + mm;
}

/** 여는 시간 글을 읽는다. 모르는 표현이 하나라도 섞이면 null(원문 그대로 보여 주기). */
export function parseOpeningHours(raw: string): ParsedHours | null {
  const spec = raw.trim();
  if (!spec) return null;
  if (spec === "24/7") {
    return {
      always: true,
      table: Array.from({ length: 7 }, () => [{ start: 0, end: 1440 }]),
    };
  }

  const table: Interval[][] = Array.from({ length: 7 }, () => []);
  let touched = false;

  for (const ruleRaw of spec.split(";")) {
    const rule = ruleRaw.trim();
    if (!rule) continue;
    // 공휴일(PH)·기념일(SH) 규칙은 달력이 없어 계산 불가 — 조용히 건너뛴다
    if (/^(PH|SH)\b/.test(rule)) continue;

    // 쉼표는 "요일 묶음 사이"에도, "시간 구간 사이"에도 쓰인다.
    // 시간이 나온 뒤 다시 요일이 나오면 새 묶음이 시작된 것이다.
    let days: number[] = [];
    let cleared = false; // 이 묶음의 요일 시간표를 비웠는가(나중 규칙이 앞 규칙을 덮음)
    let lastHadTime = false;
    for (const chunkRaw of rule.split(",")) {
      const chunk = chunkRaw.trim();
      if (!chunk) continue;

      // "Mo-Fr 08:00-18:00"처럼 요일과 시간이 한 조각에 같이 올 수 있다
      const m = chunk.match(
        /^((?:Su|Mo|Tu|We|Th|Fr|Sa)(?:-(?:Su|Mo|Tu|We|Th|Fr|Sa))?)\s*(.*)$/
      );
      let rest = chunk;
      if (m) {
        const expanded = expandDays(m[1]);
        if (!expanded) return null;
        if (lastHadTime) {
          days = expanded; // 새 묶음 시작
          cleared = false;
          lastHadTime = false;
        } else {
          days = [...days, ...expanded]; // "Mo,We,Fr"처럼 요일이 이어지는 중
        }
        if (m[2] === "") continue; // 요일만 있는 조각 — 다음 조각을 기다린다
        rest = m[2].trim();
      }
      const target = days.length > 0 ? days : WEEK_ORDER; // 요일이 없으면 매일

      if (rest === "off" || rest === "closed") {
        for (const d of target) table[d] = [];
        touched = true;
        lastHadTime = true;
        continue;
      }

      const t = rest.match(TIME_RE);
      if (!t) return null; // 해가 뜨는 시각(sunrise) 같은 표현 — 못 읽으면 원문으로
      const start = parseTime(t[1], t[2]);
      let end = parseTime(t[3], t[4]);
      if (start === null || end === null) return null;
      if (end <= start) end += 1440; // 자정을 넘겨 다음 날까지 여는 가게

      if (!cleared) {
        // 같은 요일을 다시 말하는 나중 규칙은 앞 내용을 덮는다(OSM 규칙)
        for (const d of target) table[d] = [];
        cleared = true;
      }
      for (const d of target) table[d].push({ start, end });
      touched = true;
      lastHadTime = true;
    }
  }

  if (!touched) return null;
  if (table.every((day) => day.length === 0)) return null;
  for (const day of table) day.sort((a, b) => a.start - b.start);
  return { always: false, table };
}

function fmtTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function fmtIntervals(list: Interval[]): string {
  return list.map((iv) => `${fmtTime(iv.start)}~${fmtTime(iv.end)}`).join(", ");
}

/** 시간표를 "매일 08:00~22:00" / "월~금 09:00~18:00 · 일 쉼" 꼴 한 줄로. */
export function formatHoursKo(p: ParsedHours): string {
  if (p.always) return "24시간 영업";

  const key = (d: number) => fmtIntervals(p.table[d]);
  // 월~일 순서로 훑으며 시간표가 같은 이웃 요일을 한 묶음으로 접는다
  const groups: { days: number[]; text: string }[] = [];
  for (const d of WEEK_ORDER) {
    const text = key(d);
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.days.push(d);
    else groups.push({ days: [d], text });
  }
  if (groups.length === 1) {
    return groups[0].text ? `매일 ${groups[0].text}` : "";
  }
  return groups
    .map((g) => {
      const label =
        g.days.length === 1
          ? DAY_KO[g.days[0]]
          : `${DAY_KO[g.days[0]]}~${DAY_KO[g.days[g.days.length - 1]]}`;
      return g.text ? `${label} ${g.text}` : `${label} 쉼`;
    })
    .join(" · ");
}

export interface OpenState {
  open: boolean;
  label: string;
}

// 그 나라 시각으로 "지금" 하는 중인지. utcOffsetMin = 그 나라가 세계 표준시보다 빠른 분.
export function openStateKo(
  p: ParsedHours,
  now: Date,
  utcOffsetMin: number
): OpenState | null {
  if (p.always) return { open: true, label: "24시간 영업" };

  const local = new Date(now.getTime() + utcOffsetMin * 60000);
  const day = local.getUTCDay();
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();

  // 오늘 구간 + 어제 시작해 자정을 넘긴 구간을 함께 본다
  for (const iv of p.table[day]) {
    if (minute >= iv.start && minute < iv.end)
      return { open: true, label: `영업 중 · ${fmtTime(iv.end)}에 닫아요` };
  }
  for (const iv of p.table[(day + 6) % 7]) {
    if (iv.end > 1440 && minute < iv.end - 1440)
      return { open: true, label: `영업 중 · ${fmtTime(iv.end)}에 닫아요` };
  }

  // 닫혀 있음 — 다음에 여는 때를 일주일 안에서 찾는다
  for (let ahead = 0; ahead < 7; ahead++) {
    const d = (day + ahead) % 7;
    for (const iv of p.table[d]) {
      if (ahead === 0 && iv.start <= minute) continue;
      const at = fmtTime(iv.start);
      if (ahead === 0) return { open: false, label: `영업 전 · ${at}에 열어요` };
      if (ahead === 1) return { open: false, label: `영업 종료 · 내일 ${at}에 열어요` };
      return { open: false, label: `영업 종료 · ${DAY_KO[d]}요일 ${at}에 열어요` };
    }
  }
  return null;
}

export interface HoursView {
  /** 한국어로 바꾼 시간표(못 읽으면 원문 그대로). */
  text: string;
  /** 지금 하는 중인지 — 확실할 때만 채워진다. */
  state: OpenState | null;
}

/**
 * 말풍선용 한 벌 — 시간표 글과 "지금 영업 중" 판정을 함께 만든다.
 * 그 나라 시각은 경도로 어림한다(경도 15도 = 1시간). 어림이 1시간 틀릴 수 있으므로,
 * ±1시간 어느 쪽으로 재도 판정이 같을 때만 "영업 중/종료"를 보여 준다 —
 * 애매하면 판정을 숨기는 게 틀린 안내보다 낫다.
 */
export function hoursViewKo(spec: string, lng: number, now = new Date()): HoursView {
  const parsed = parseOpeningHours(spec);
  if (!parsed) return { text: spec, state: null };

  const text = formatHoursKo(parsed);
  const offset = Math.round(lng / 15) * 60;
  const votes = [offset - 60, offset, offset + 60].map((o) =>
    openStateKo(parsed, now, o)
  );
  const mid = votes[1];
  const agreed =
    mid !== null && votes.every((v) => v !== null && v.open === mid.open);
  return { text: text || spec, state: agreed ? mid : null };
}
