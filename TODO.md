# 여행 핀 지도 앱 — 할 일 체크리스트

> 마지막 갱신: 2026-08-07
> 목표 상태: 지도 핀 + AI 맛집 + 협업 + 일정 + Vercel 배포

---

## ✅ 끝난 것

- [x] Next.js 16 프로젝트 세팅 (React 19, TypeScript, App Router)
- [x] Leaflet + OpenStreetMap 무료 지도
- [x] 도시 검색 이동 (아시아 20개 + 무료 주소 검색 폴백)
- [x] 핀 추가/삭제/드래그 (맛집🍜·관광지📸·카페☕·숙소🛏·기타📍)
- [x] 핀 메모·이모지·타입별 색
- [x] AI 맛집 찾기 (Overpass API, 최대 15개, 중복 방지, 30초 타임아웃)
- [x] 여행 방 단위 핀 저장 (localStorage, 방 전환 시 핀 로드)
- [x] 모바일 반응형 (하단 📌 버튼 + 풀스크린 시트)
- [x] 라이트 Travel 테마 (#0EA5E9)

### 1. 여러 사람 함께 편집 (로그인 없이)

- [x] `@supabase/supabase-js` 설치
- [x] `src/lib/supabase.ts` — 클라이언트 (env 없으면 null fallback)
- [x] `src/lib/supabaseServer.ts` — 서버 라우트용 클라이언트
- [x] `src/lib/realtime.ts` — 실시간 구독/브로드캐스트
- [x] `src/app/api/pins/route.ts` — 핀 CRUD (GET/POST/DELETE)
- [x] `src/app/api/itinerary/route.ts` — 일정 저장/조회
- [x] 초대 링크 — URL `?room=abc123` 참여 + 클립보드 복사
- [x] 사용자 식별 — localStorage UUID, 내 핀=타입 색 / 친구 핀=회색 점선 + "친구" 표시
- [x] Supabase env 없을 때 graceful fallback (안내 배너 + 로컬 동작)

### 2. 여행 일정 (날짜별 핀 배정)

- [x] `Itinerary` / `DayPlan` 타입
- [x] `ItineraryPanel.tsx` — 시작·종료일 + Day 카드 (최대 60일)
- [x] 사이드바 탭 전환 — "📌 핀" / "📅 일정"
- [x] 날짜에 핀 배정 / 빼기, 핀 삭제 시 일정에서도 자동 제거
- [x] 일정 저장 — localStorage `travel-itinerary-{room}` + 실시간 브로드캐스트

### 3. 통합 검증

- [x] `npx tsc --noEmit` / `npm run lint` / `npm run build` 전부 통과
- [x] 헤드리스 브라우저 실물 렌더 — 1440px 데스크톱 + 375px 모바일
- [x] 시나리오 검증 — 지도 클릭 → 핀 추가 → 일정 탭 → 날짜 지정 → Day 1 배정
- [x] AI 맛집 찾기 실제 API 호출 (오사카 범위, 15개 반환)
- [x] 브라우저 콘솔 오류 0건 (하이드레이션 불일치 수정 완료)
- [x] 모바일 시트 위로 지도 버튼이 비쳐 보이던 겹침 수정

---

## ⬜ 남은 할 일

### 4. GitHub

- [x] git 저장소 + `.gitignore`
- [ ] 원격 저장소 연결 + push

### 5. Vercel 배포

- [ ] `vercel` 배포 실행
- [ ] 배포 URL 브라우저 정상 동작 확인

### 6. 함께 편집 실사용 (Supabase 키 필요 — 사용자 작업)

- [ ] Supabase 프로젝트 생성 후 `.env.local`에 URL·anon key 입력 (`.env.example` 참고)
- [ ] README의 SQL로 `pins` / `itineraries` 테이블 생성
- [ ] 초대 링크로 두 창 띄워 실시간 동기화 실측
      (키가 없어 현재는 폴백 경로만 검증됨)
