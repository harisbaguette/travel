-- 여행 핀 지도 — Neon(Postgres) 테이블
-- 적용: neonctl connection-string 으로 받은 주소에 psql로 붙어 이 파일을 실행하거나,
--       Neon 콘솔 SQL 편집기에 붙여넣는다. 여러 번 실행해도 안전하다.

-- 핀 --------------------------------------------------------------------
-- 지운 핀도 행을 남긴다(deleted = true). 그래야 다른 사람 화면이
-- "이 핀은 지워졌다"는 사실을 나중에 물어봐도 알 수 있다.
create table if not exists pins (
  id          text primary key,
  room_id     text        not null,
  lat         double precision not null,
  lng         double precision not null,
  type        text        not null,
  name        text        not null,
  memo        text        not null default '',
  emoji       text        not null default '',
  is_ai       boolean     not null default false,
  created_at  bigint      not null,
  created_by  text        not null default '',
  deleted     boolean     not null default false,
  -- 비서가 추천 근거로 쓴 블로그 글 링크 목록 [{title, url}] — 없으면 빈 목록.
  sources     jsonb       not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 이미 만들어 둔 DB에도 위 칸을 붙인다(여러 번 실행해도 안전하다).
alter table pins add column if not exists sources jsonb not null default '[]'::jsonb;

create index if not exists pins_room_idx on pins (room_id);
-- "이 시각 이후 바뀐 것만 주세요" 조회를 빠르게 하기 위한 색인
create index if not exists pins_room_updated_idx on pins (room_id, updated_at);

-- 일정 ------------------------------------------------------------------
-- 방 하나에 일정 하나. 통째로 저장한다(날짜 카드 구조가 통으로 바뀌기 때문).
create table if not exists itineraries (
  room_id    text primary key,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

-- 수정 시각 자동 갱신 -----------------------------------------------------
-- 앱이 updated_at을 깜빡해도 DB가 알아서 지금 시각으로 찍어 준다.
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pins_touch on pins;
create trigger pins_touch before update on pins
  for each row execute function touch_updated_at();

drop trigger if exists itineraries_touch on itineraries;
create trigger itineraries_touch before update on itineraries
  for each row execute function touch_updated_at();
