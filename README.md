# 🗺️ 여행 핀 지도

지도에 가고 싶은 곳을 콕콕 찍어 두고, 날짜별로 나눠 계획을 세우는 여행 앱.
로그인 없이 링크만 나눠 주면 친구와 같이 편집할 수 있다.

- 지도: Leaflet + OpenStreetMap (무료, 키 불필요)
- 맛집 찾기: Overpass API (OpenStreetMap 데이터, 무료)
- 함께 편집: Supabase Realtime (키 없으면 자동으로 혼자 쓰기 모드)

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
```

## 기능

| 기능 | 설명 |
|------|------|
| 도시 검색 이동 | 아시아 20개 도시 내장 + 이름으로 주소 검색 |
| 핀 | 맛집🍜 관광지📸 카페☕ 숙소🛏 기타📍 — 추가·삭제·드래그·메모 |
| AI 맛집 찾기 | 지금 보이는 지도 범위의 음식점·카페를 최대 15개 자동 추가 |
| 여행 방 | 방마다 핀·일정을 따로 저장. `?room=xxx` 링크로 참여 |
| 일정 | 시작일·종료일을 고르면 Day 카드가 생기고, 핀을 날짜에 배정 |
| 함께 편집 | 내 핀은 색 테두리, 친구 핀은 회색 점선 테두리 |

## 함께 편집 켜기 (선택)

Supabase 키가 없어도 앱은 그대로 동작한다 (내 브라우저에만 저장).
여러 사람이 실시간으로 같이 편집하려면 `.env.local`을 만든다:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

핀·일정을 서버에도 남기려면 Supabase SQL 편집기에서 아래를 실행한다
(테이블 없이 실시간 방송만 써도 함께 편집은 동작한다):

```sql
create table pins (
  id text primary key,
  room_id text not null,
  lat double precision not null,
  lng double precision not null,
  type text not null,
  name text not null,
  memo text default '',
  emoji text default '',
  is_ai boolean default false,
  created_at bigint not null,
  created_by text default ''
);
create index pins_room_idx on pins(room_id);
alter table pins enable row level security;
create policy "anyone can read/write" on pins for all using (true) with check (true);

create table itineraries (
  room_id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table itineraries enable row level security;
create policy "anyone can read/write" on itineraries for all using (true) with check (true);
```

> 위 정책은 링크를 아는 사람이면 누구나 읽고 쓸 수 있는 설정이다. 공개 여행 계획용으로만 쓴다.

## 배포

Vercel에 그대로 올라간다. 함께 편집을 쓸 경우 Vercel 프로젝트 설정에
위 환경 변수 2개를 등록한다.
