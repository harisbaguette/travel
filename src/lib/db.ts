import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Neon(인터넷에 있는 Postgres) 연결. 서버 라우트에서만 쓴다 — 접속 문자열이 비밀이기 때문.
//
// DATABASE_URL이 없으면 null을 돌려준다. 그러면 앱은 "혼자 쓰기 모드"로 그냥 동작한다
// (핀·일정이 내 브라우저에만 저장됨). 키가 없다고 오류를 내지 않는 것이 이 파일의 핵심 약속이다.

let cached: NeonQueryFunction<false, false> | null | undefined;

export function getDb(): NeonQueryFunction<false, false> | null {
  if (cached !== undefined) return cached;
  const url = process.env.DATABASE_URL?.trim();
  if (!url || !url.startsWith("postgres")) {
    cached = null;
    return null;
  }
  try {
    cached = neon(url);
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export function isDbReady(): boolean {
  return getDb() !== null;
}
