# 여행 핀 지도 — 할 일 (병렬 작업용으로 쪼갠 판)

> 마지막 갱신: 2026-08-07
> 저장소: git@github.com:harisbaguette/travel.git (main 푸시 완료)
> 배포: https://travel-chi-lilac.vercel.app (동작 중)
> 함께 편집 저장소를 **Supabase → Neon(Postgres)** 으로 갈아탄다.

---

## ✅ 이미 끝난 것

- Next.js 16 + React 19 + TypeScript, Leaflet 무료 지도, 도시 검색 이동
- 핀 추가/삭제/드래그/메모, 타입 5종(맛집🍜 관광지📸 카페☕ 숙소🛏 기타📍)
- AI 맛집 찾기(Overpass API) — 로컬은 정상, **배포 환경에서 막힘(아래 F)**
- 여행 방(`?room=xxx` 초대 링크 + 복사), 방마다 핀·일정 따로 저장
- 날짜별 일정(시작·종료일 → Day 카드, 핀 배정/빼기), 사이드바 📌핀/📅일정 탭
- 내 핀 / 친구 핀 구분 표시(색 테두리 vs 회색 점선 + "친구" 배지)
- 모바일 반응형(헤더 2줄 접힘, 풀스크린 시트), 하이드레이션 오류 0
- tsc·lint·build 통과 + 헤드리스 브라우저 실물 검증(1440px/375px)
- GitHub 푸시 + Vercel 프로덕션 배포

---

## 🔀 병렬 작업 묶음 (파일이 겹치지 않게 나눔)

같은 파일을 두 사람(창)이 동시에 고치면 나중 저장이 앞 것을 덮는다.
아래 묶음은 **담당 파일이 서로 겹치지 않는다** — A·C·F는 지금 바로 동시에 시작 가능.

### 의존 관계

```
F (맛집 API 고치기)  ── 독립, 언제든 시작
A (DB 기반)  ──▶  B (API 라우트)  ──┐
             └──▶  C (동기화 훅)  ──┴──▶  D (화면 배선) ──▶ E (배포·실측)
```

---

### 📦 A. Neon 데이터베이스 기반 만들기 — [Not started]

**담당 파일**: `src/lib/db.ts`(새로), `src/lib/schema.sql`(새로), `.env.example`, `README.md`

- [ ] Neon 프로젝트 만들고 연결 문자열 받기 (무료 등급: 프로젝트 100개, 저장 0.5GB)
- [ ] `npm i @neondatabase/serverless` — HTTP로 붙는 드라이버라 Vercel 서버리스에서 동작
- [ ] `src/lib/db.ts` — `DATABASE_URL` 없으면 `null` 반환(키 없이도 앱이 그냥 돌아가야 함)
- [ ] `src/lib/schema.sql` — 테이블 2개
      `pins(id, room_id, lat, lng, type, name, memo, emoji, is_ai, created_at, created_by, updated_at)`
      `itineraries(room_id pk, data jsonb, updated_at)`
      + `pins(room_id)` 인덱스, `updated_at` 자동 갱신
- [ ] `.env.example`·README를 Neon 기준으로 갈아엎기 (Supabase 문구 제거)
- [ ] 기존 파일 삭제: `src/lib/supabase.ts`, `src/lib/supabaseServer.ts`
- [ ] `npm uninstall @supabase/supabase-js`

### 📦 B. API 라우트 Neon으로 교체 — [Not started] (A 이후)

**담당 파일**: `src/app/api/pins/route.ts`, `src/app/api/itinerary/route.ts`

- [ ] `GET /api/pins?room=&since=` — `since`(밀리초) 이후 바뀐 것만 반환 + 서버 시각 동봉
- [ ] `POST /api/pins` — 핀 1개 upsert
- [ ] `DELETE /api/pins?room=&id=` — 지운 기록도 남겨야 다른 창이 지움을 안다
      (`deleted boolean` 칸으로 표시, 실제 행은 남김)
- [ ] `GET/POST /api/itinerary` — 방 단위 통째 저장·조회
- [ ] DB 미설정이면 `{ok:true, pins:[]}` 같은 빈 응답 — 오류 대신 조용히 혼자 쓰기 모드
- [ ] 입력값 검증(방 이름 길이, 좌표 범위, 이름 길이) — 아무 값이나 들어오면 거절

### 📦 C. 클라이언트 동기화(폴링) — [Done — realtime.ts 삭제만 D로 넘김] (A 이후, B와 동시 가능)

**담당 파일**: `src/lib/sync.ts`(새로), `src/lib/realtime.ts`(삭제)

> Neon에는 Supabase 같은 "바뀌면 알려주는" 기능이 없다. 그래서 3초마다
> "새로 바뀐 거 있어?"라고 물어보는 방식으로 만든다. 사람 2~5명 쓰는 앱엔 충분하다.

- [x] `useRoomSync(room)` — 3초 주기로 `?since=마지막시각` 조회, 바뀐 것만 합치기
      (+ `pushPin`/`pushPinDelete`/`pushItinerary` 전송 함수, `applyPinChanges` 합치기 도우미 — D가 쓸 것)
- [x] 화면이 안 보이면(다른 탭) 폴링 멈추기 — `document.visibilityState`
- [x] 내가 방금 바꾼 건 되돌아와도 무시(내 것이 최신) — `updated_at` 큰 쪽이 이김
- [x] DB 미설정이면 폴링 자체를 하지 않음 (`configured:false`거나 `serverNow` 없으면 정지)
- [ ] `src/lib/realtime.ts` 삭제 → **D로 이관**: 지금 지우면 `page.tsx`가 아직 import 중이라
      빌드가 깨진다. D에서 page.tsx 배선을 `useRoomSync`로 바꾸면서 같이 지울 것.
- ⚠️ B 구현 시 응답 규격은 `src/lib/sync.ts` 상단 주석 참조
      (`GET /api/pins`가 `configured`·`serverNow`·`updatedAt`·`deleted`를 반드시 포함해야 폴링이 동작)

### 📦 D. 화면 배선 — [Not started] (B·C 이후)

**담당 파일**: `src/app/page.tsx`

- [ ] `subscribeToRoom`/`broadcastPins`/`broadcastItinerary` 호출 제거 → `useRoomSync`로 교체
- [ ] 핀 추가·삭제·이동 시 서버에도 보내기(실패해도 로컬은 유지)
- [ ] 안내 배너 문구를 Neon 기준으로 수정
- [ ] `isSupabaseReady` 사용처 정리

### 📦 E. 배포·실측 — [Not started] (D 이후)

- [ ] Vercel 프로젝트에 `DATABASE_URL` 등록 후 재배포
- [ ] 창 2개를 같은 초대 링크로 열어 핀 추가·삭제가 3초 안에 반영되는지 확인
- [ ] 모바일 375px 실물 확인
- [ ] tsc·lint·build + 콘솔 오류 0 재확인

### 📦 F. AI 맛집 찾기 배포 환경 고치기 — [Not started] (독립, 지금 시작 가능)

**담당 파일**: `src/app/api/search-food/route.ts`

> 지금 상태: 내 컴퓨터에서는 15개 잘 나오는데, 배포된 주소에서 누르면 실패한다.
> Overpass 서버가 클라우드에서 온 요청을 `406`으로 거절하고 가끔 `504`(시간 초과)를 낸다.

- [ ] 서버 여러 곳을 차례로 시도(하나 막히면 다음 것): overpass-api.de →
      overpass.private.coffee → maps.mail.ru/osm/tools/overpass
      (공식 목록: https://wiki.openstreetmap.org/wiki/Overpass_API)
- [ ] `User-Agent`·`Accept` 헤더 제대로 보내기 (없으면 거절당함)
- [ ] 서버마다 짧게 끊기(8~10초)고 다음으로 넘어가기 — 전체가 늦어지지 않게
- [ ] 전부 실패하면 사용자에게 쉬운 말로 안내
- [ ] 배포 주소에서 실제로 눌러 15개가 나오는지 확인(로컬 통과는 증거가 안 됨)

---

## 📌 권장 진행 순서

1. **지금 동시에**: A · F
2. A 끝나면 동시에: B · C
3. 그다음: D → E
