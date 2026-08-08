// 구글 지도 연결 — 열쇠(API 키)가 있을 때만 켜진다.
// 열쇠는 Vercel/로컬 환경변수 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY에 넣는다.
// 구글 지도는 열쇠 없이 쓰는 것이 약관 위반이라, 열쇠가 없으면 기존 무료 지도를 그대로 쓴다.

export const GOOGLE_MAPS_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export function hasGoogleKey(): boolean {
  return GOOGLE_MAPS_KEY.length > 0;
}

let loadPromise: Promise<boolean> | null = null;

// 열쇠가 틀렸을 때 구글이 불러 주는 신고 전화 — 받으면 무료 지도로 되돌릴 수 있게 한다.
export function onGoogleAuthFailure(cb: () => void): void {
  if (typeof window === "undefined") return;
  (window as typeof window & { gm_authFailure?: () => void }).gm_authFailure = cb;
}

// 구글 지도 프로그램(Maps JavaScript API)을 한 번만 내려받는다.
// 성공하면 true, 실패(열쇠 오류·네트워크)면 false — 실패해도 앱은 기존 지도로 계속 돈다.
export function loadGoogleMaps(): Promise<boolean> {
  if (typeof window === "undefined" || !hasGoogleKey())
    return Promise.resolve(false);
  const w = window as typeof window & { google?: { maps?: unknown } };
  if (w.google?.maps) return Promise.resolve(true);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    // language=ko: 전 세계 지명을 구글맵 앱처럼 한국어 표기로 보여준다
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      GOOGLE_MAPS_KEY
    )}&language=ko&region=KR`;
    script.async = true;
    const timer = setTimeout(() => resolve(false), 10000);
    script.onload = () => {
      clearTimeout(timer);
      resolve(Boolean(w.google?.maps));
    };
    script.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}
