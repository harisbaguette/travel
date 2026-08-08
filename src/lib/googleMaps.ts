// 공식 구글 지도 연결 — 열쇠(API 키)가 있어야 지도가 뜬다.
// 열쇠는 Vercel/로컬 환경변수 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY에 넣는다.
// 열쇠에 리퍼러 제한이 걸려 있어 서버에서 부르면 막힌다 — 구글 호출은 전부 브라우저에서 한다.

export const GOOGLE_MAPS_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export function hasGoogleKey(): boolean {
  return GOOGLE_MAPS_KEY.length > 0;
}

let loadPromise: Promise<boolean> | null = null;

// 열쇠가 틀렸을 때 구글이 불러 주는 신고 전화.
export function onGoogleAuthFailure(cb: () => void): void {
  if (typeof window === "undefined") return;
  (window as typeof window & { gm_authFailure?: () => void }).gm_authFailure = cb;
}

// 지도 프로그램이 다 내려오면 구글이 불러 주는 이름.
const READY_CALLBACK = "__travelGoogleMapsReady";

// 구글 지도 프로그램(Maps JavaScript API)을 한 번만 내려받는다.
// language=ko&region=KR: 지명·가게 종류·영업시간을 구글맵 앱처럼 한국어로 받는다.
export function loadGoogleMaps(): Promise<boolean> {
  if (typeof window === "undefined" || !hasGoogleKey())
    return Promise.resolve(false);
  const w = window as typeof window & {
    google?: { maps?: unknown };
    [READY_CALLBACK]?: () => void;
  };
  if (w.google?.maps) return Promise.resolve(true);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 10000);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    w[READY_CALLBACK] = () => done(Boolean(w.google?.maps));
    const params = new URLSearchParams({
      key: GOOGLE_MAPS_KEY,
      v: "weekly",
      language: "ko",
      region: "KR",
      libraries: "maps,places,geocoding",
      loading: "async",
      callback: READY_CALLBACK,
    });
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => done(false);
    document.head.appendChild(script);
  });
  return loadPromise;
}

interface MapsLibraries {
  core: google.maps.CoreLibrary;
  maps: google.maps.MapsLibrary;
  places: google.maps.PlacesLibrary;
  geocoding: google.maps.GeocodingLibrary;
}

// 필요한 부분만 꺼내 쓰는 창구 — 지도 프로그램이 아직이면 먼저 내려받고 기다린다.
export async function importMapsLibrary<K extends keyof MapsLibraries>(
  name: K
): Promise<MapsLibraries[K]> {
  const ok = await loadGoogleMaps();
  if (!ok) throw new Error("google maps load failed");
  return (await google.maps.importLibrary(name)) as MapsLibraries[K];
}
