"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";
import {
  CalendarPlus,
  Clock,
  Link2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  MapPinPlus,
  Pencil,
  Phone,
  Trash2,
  X,
} from "lucide-react";
import L, { type Map as LeafletMap } from "leaflet";
import "leaflet.gridlayer.googlemutant";
import type { Pin } from "@/lib/types";
import { PIN_TYPES, pinMarkerSvg } from "@/lib/pinTypes";
import { googleMapsUrl } from "@/lib/mapLinks";
import { hoursViewKo } from "@/lib/openingHours";
import { hasGoogleKey, loadGoogleMaps, onGoogleAuthFailure } from "@/lib/googleMaps";

/** 하루치 동선 — 일정 화면에서 짠 순서대로 핀 자리를 이은 선 하나. */
export interface DayRoute {
  date: string;
  label: string; // "1일차" 같은 이름
  color: string;
  points: [number, number][]; // 방문 순서대로의 [위도, 경도]
}

interface MapViewProps {
  onReady?: (map: LeafletMap) => void;
  pins?: Pin[];
  /** 일자별 동선 — 일정에 두 곳 이상 넣은 날만 온다. */
  dayRoutes?: DayRoute[];
  /** 지금 이 브라우저 사용자 ID — 내 핀/남의 핀 구분용. 빈 값이면 전부 내 핀 취급. */
  currentUserId?: string;
  /** 처음 보여줄 위치와 확대 정도. */
  initialCenter?: [number, number];
  initialZoom?: number;
  /** 검색으로 찾은 자리 — 파란 점으로 잠시 표시해 둔다. */
  searchTarget?: { lat: number; lng: number; name: string; address?: string } | null;
  onSearchTargetAdd?: () => void;
  onSearchTargetClose?: () => void;
  onPinDelete?: (id: string) => void;
  /** 핀 말풍선의 "수정" — 이름·종류·메모 고치는 창을 부모가 띄운다. */
  onPinEdit?: (pin: Pin) => void;
  /** 지도 카드의 "핀 저장" — 그 자리를 새 핀으로 꽂는 창을 부모가 띄운다. */
  onSavePlace?: (place: { lat: number; lng: number; name: string }) => void;
  /** 말풍선의 "일정에 넣기" — 며칠째에 넣을지 고르는 창을 부모가 띄운다. */
  onAddToSchedule?: (place: {
    lat: number;
    lng: number;
    name: string;
    pinId?: string;
  }) => void;
  className?: string;
}

// 구글 지도 그림 조각(타일) 주소 — 열쇠(API 키)나 계정 없이 바로 받아올 수 있다.
// hl=ko: 지명을 구글맵 앱처럼 한국어로 보여 준다.
// simplify: 구글이 공식으로 열어 둔 문은 아님 — 막히는 날이 오면 공식 열쇠를 넣어 올린다.
const GOOGLE_TILE_URL =
  "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko";

const DEFAULT_CENTER: [number, number] = [10.2899, 103.984]; // 푸꾸옥
const DEFAULT_ZOOM = 11;

// 바탕 지도 층 — 구글 지도만 쓴다.
// 열쇠가 있으면 공식 구글 지도(googlemutant), 없으면 열쇠 없는 구글 조각.
function GoogleBaseLayer() {
  const map = useMap();
  const [mode, setMode] = useState<"google" | "gtile">(() => {
    if (typeof window === "undefined") return "gtile";
    return hasGoogleKey() ? "google" : "gtile";
  });

  // 출처 표기는 평소 작은 ⓘ 동그라미로 접어 둔다(지도를 가리지 않게).
  // "Leaflet" 링크는 지우고, 손가락으로 눌러도 펼쳐지도록 초점을 받게 한다.
  useEffect(() => {
    const control = map.attributionControl;
    if (!control) return;
    control.setPrefix(false);
    control.getContainer()?.setAttribute("tabindex", "0");
  }, [map]);

  // 구글 지도 층 — 공식 구글 지도 프로그램을 내려받아 Leaflet 밑에 깐다(googlemutant).
  // 열쇠가 틀리거나 내려받기가 실패하면 조용히 열쇠 없는 구글 조각으로 되돌아간다.
  useEffect(() => {
    if (mode !== "google") return;
    let cancelled = false;
    let layer: L.Layer | null = null;
    // 열쇠가 틀렸다고 구글이 알려오면 열쇠 없는 구글 조각으로 되돌린다
    onGoogleAuthFailure(() => {
      if (!cancelled) setMode("gtile");
    });
    void loadGoogleMaps().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        setMode("gtile");
        return;
      }
      try {
        layer = L.gridLayer.googleMutant({ type: "roadmap" });
        layer.addTo(map);
      } catch {
        setMode("gtile");
      }
    });
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, mode]);

  // 열쇠 없는 구글 조각 — 공식 층이 없거나 실패했을 때의 기본 바탕
  if (mode === "gtile") {
    return (
      <TileLayer
        attribution="&copy; Google"
        url={GOOGLE_TILE_URL}
        subdomains={["0", "1", "2", "3"]}
        maxZoom={20}
      />
    );
  }
  return null;
}

// ── 지도 누르는 손맛 — 구글맵과 똑같이 세 가지로 나눈다 ──
// · 화면에 그려진 가게(아이콘·이름)를 누르면 → 그 가게 카드가 뜬다
// · 빈 땅을 그냥 누르면 → 아무 일도 없다(열려 있던 카드만 닫힌다) — 좌표 카드 금지
// · 길게 누르거나 마우스 오른쪽 → 빨간 핀을 떨어뜨리고 그 자리 주소를 알려 준다
interface PoiInfo {
  kind: "poi" | "address";
  name: string;
  category?: string;
  lat: number;
  lng: number;
  hours?: string;
  phone?: string;
  website?: string;
}

// 지금 지도 위에 떠 있는 카드 — 가게 카드거나, 떨어뜨린 핀 카드거나 둘 중 하나.
type TapCard =
  | { type: "poi"; poi: PoiInfo }
  | { type: "drop"; lat: number; lng: number; address?: string };

// 여는 시간 한 줄 — "영업 중 · 22:00에 닫아요" 판정을 초록/빨강으로 먼저, 시간표를 그 아래에.
// 판정은 그 나라 시각으로 계산하고, 애매하면(시간대 어림이 흔들리면) 시간표만 보여 준다.
function HoursLine({ spec, lng }: { spec: string; lng: number }) {
  const view = useMemo(() => hoursViewKo(spec, lng), [spec, lng]);
  const showText = view.text !== view.state?.label;
  return (
    <div className="mt-1 flex items-start gap-1 text-xs text-[var(--text-muted)]">
      <Clock size={11} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        {view.state && (
          <>
            <span
              className={
                view.state.open
                  ? "font-semibold text-[#0e7a4f]"
                  : "font-semibold text-[var(--danger)]"
              }
            >
              {view.state.label}
            </span>
            {showText && <br />}
          </>
        )}
        {showText && view.text}
      </span>
    </div>
  );
}

// 그 좌표에 뭐가 있는지 서버(/api/poi-at)에 조용히 물어봐 두는 재료 — 검색 표식 카드가 쓴다.
function usePlaceDetails(lat: number, lng: number) {
  // 어느 좌표의 답인지 꼬리표를 같이 붙여 둔다 — 좌표가 바뀌면 꼬리표가 어긋나
  // 옛 답 대신 "아직 없음"이 돌아간다(지우는 일을 따로 하지 않아도 된다).
  const [result, setResult] = useState<{
    key: string;
    poi: PoiInfo | null;
  } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    const key = `${lat},${lng}`;
    void fetch(`/api/poi-at?lat=${lat}&lng=${lng}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!ac.signal.aborted)
          setResult({
            key,
            poi: (d as { poi?: PoiInfo | null } | null)?.poi ?? null,
          });
      })
      .catch(() => {});
    return () => ac.abort();
  }, [lat, lng]);
  return result && result.key === `${lat},${lng}` ? result.poi : null;
}

// 두 자리 사이 거리(m) — 찾아온 정보가 정말 그 가게 것인지 가려낼 때 쓴다.
function metersApart(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const kx = Math.cos((aLat * Math.PI) / 180) * 111320;
  return Math.hypot((aLat - bLat) * 111320, (aLng - bLng) * kx);
}

// 이름이 서로 겹치는가 — 띄어쓰기와 대소문자를 지우고 한쪽이 다른 쪽을 품으면 같은 곳으로 본다.
function namesOverlap(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/\s+/g, "");
  const nb = b.toLowerCase().replace(/\s+/g, "");
  if (na.length < 2 || nb.length < 2) return false;
  return na.includes(nb) || nb.includes(na);
}

function PoiTapLayer({
  onAddToSchedule,
  onSavePlace,
}: {
  onAddToSchedule?: MapViewProps["onAddToSchedule"];
  onSavePlace?: MapViewProps["onSavePlace"];
}) {
  const [card, setCard] = useState<TapCard | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // 말풍선이 열린 채로 지도를 눌렀는지 적어 두는 쪽지 — 그 손짓은 "닫기"지 "찾기"가 아니다.
  const popupOpenRef = useRef(false);
  const suppressRef = useRef(false);
  // 두 번 빠르게 누르는 확대 손짓과 구분하려고 잠깐 기다리는 시계
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // 톡 누름 — 화면에 그려져 있던 가게를 눌렀을 때만 카드를 띄운다(구글맵과 같음).
  // 빈 땅이면 조용히 아무 일도 하지 않는다 — 좌표 카드·알아보는 중 카드를 만들지 않는다.
  const lookup = (lat: number, lng: number, zoom: number) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    void fetch(`/api/poi-at?lat=${lat}&lng=${lng}&z=${zoom}&strict=1`, {
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (ac.signal.aborted) return;
        const found = (d as { poi?: PoiInfo | null } | null)?.poi;
        if (found && found.kind === "poi") setCard({ type: "poi", poi: found });
      })
      .catch(() => {});
  };

  // 길게 누름·마우스 오른쪽 — 그 자리에 빨간 핀을 바로 떨어뜨리고, 주소는 뒤따라 채운다.
  const dropPin = (lat: number, lng: number) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setCard({ type: "drop", lat, lng });
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const fill = (address: string) =>
      setCard((prev) =>
        prev?.type === "drop" && prev.lat === lat && prev.lng === lng
          ? { ...prev, address }
          : prev
      );
    void fetch(`/api/poi-at?lat=${lat}&lng=${lng}&addr=1`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (ac.signal.aborted) return;
        const found = (d as { poi?: PoiInfo | null } | null)?.poi;
        fill(found?.name ?? fallback);
      })
      .catch(() => {
        // 주소 알아보기가 실패해도 "알아보는 중…"에 갇히지 않게 좌표라도 채워 준다
        if (!ac.signal.aborted) fill(fallback);
      });
  };

  const map = useMapEvents({
    popupopen() {
      popupOpenRef.current = true;
    },
    popupclose() {
      popupOpenRef.current = false;
    },
    // 손이 닿는 순간(말풍선이 닫히기 전)에 "열린 말풍선이 있었는지"를 먼저 적어 둔다
    preclick() {
      suppressRef.current = popupOpenRef.current;
    },
    click(e) {
      // 말풍선을 닫으려던 손짓 — 새 카드를 띄우지 않고 조용히 치우기만 한다(구글맵과 같음)
      if (suppressRef.current) {
        suppressRef.current = false;
        setCard(null);
        return;
      }
      const { lat, lng } = e.latlng;
      // 두 번 빠르게 누르면 확대 손짓 — 잠깐 기다려서 한 번 누른 게 맞을 때만 찾는다
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        lookup(lat, lng, map.getZoom());
      }, 260);
    },
    dblclick() {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
    },
    // 마우스 오른쪽 누름·손가락 길게 누름 — 구글맵처럼 빨간 핀을 떨어뜨린다
    contextmenu(e) {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      suppressRef.current = false;
      dropPin(e.latlng.lat, e.latlng.lng);
    },
  });

  // 카드 내용이 갱신될 때마다 말풍선을 열어 둔다
  useEffect(() => {
    if (!card) return;
    const timer = setTimeout(() => markerRef.current?.openPopup(), 100);
    return () => clearTimeout(timer);
  }, [card]);

  // 가게 카드는 표식 없이 말풍선만 — 구글맵처럼 화면에 그려진 가게 아이콘을 그대로 가리킨다.
  const poiAnchorIcon = useMemo(
    () =>
      L.divIcon({
        className: "search-target-icon",
        html: "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        popupAnchor: [0, -14],
      }),
    []
  );

  // 떨어뜨린 핀 — 구글맵의 빨간 물방울 핀과 같은 모양
  const dropIcon = useMemo(
    () =>
      L.divIcon({
        className: "drop-pin-icon",
        html: `<svg width="27" height="43" viewBox="0 0 27 43" aria-hidden="true"><path fill="#EA4335" stroke="#B31412" stroke-width="1" d="M13.5 .5C6.3 .5 .5 6.3 .5 13.5c0 9.8 13 29 13 29s13-19.2 13-29C26.5 6.3 20.7 .5 13.5 .5Z"/><circle cx="13.5" cy="13.5" r="4.6" fill="#7B231E"/></svg>`,
        iconSize: [27, 43],
        iconAnchor: [13, 43],
        popupAnchor: [0, -40],
      }),
    []
  );

  if (!card) return null;
  const isDrop = card.type === "drop";
  const pos: [number, number] = isDrop
    ? [card.lat, card.lng]
    : [card.poi.lat, card.poi.lng];
  // 핀 저장·일정에 넘길 이름 — 가게면 가게 이름, 떨어뜨린 핀이면 주소(없으면 좌표)
  const placeName = isDrop
    ? card.address ?? `${card.lat.toFixed(5)}, ${card.lng.toFixed(5)}`
    : card.poi.name;
  return (
    <Marker
      position={pos}
      icon={isDrop ? dropIcon : poiAnchorIcon}
      zIndexOffset={400}
      ref={(m) => {
        markerRef.current = m as L.Marker | null;
      }}
    >
      <Popup className="pin-popup">
        <div className="min-w-[180px] max-w-[240px]">
          {isDrop ? (
            <>
              <div className="font-semibold text-[var(--text)]">떨어뜨린 핀</div>
              <div className="mt-0.5 flex items-start gap-1 text-xs text-[var(--text-muted)]">
                <MapPin size={11} aria-hidden className="mt-0.5 shrink-0" />
                <span className="min-w-0">{card.address ?? "주소 알아보는 중…"}</span>
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold text-[var(--text)]">{card.poi.name}</div>
              {card.poi.category && (
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {card.poi.category}
                </div>
              )}
              {card.poi.hours && <HoursLine spec={card.poi.hours} lng={card.poi.lng} />}
              {card.poi.phone && (
                <div className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  <Phone size={11} aria-hidden className="shrink-0" />
                  {card.poi.phone}
                </div>
              )}
            </>
          )}
          <div className="popup-actions">
            {onSavePlace && (
              <button
                type="button"
                onClick={() => {
                  onSavePlace({ lat: pos[0], lng: pos[1], name: placeName });
                  setCard(null);
                }}
                className="popup-action popup-action--accent"
              >
                <span className="popup-action__icon">
                  <MapPinPlus size={16} strokeWidth={2.2} aria-hidden />
                </span>
                핀 저장
              </button>
            )}
            {onAddToSchedule && (
              <button
                type="button"
                onClick={() =>
                  onAddToSchedule({ lat: pos[0], lng: pos[1], name: placeName })
                }
                className="popup-action"
              >
                <span className="popup-action__icon">
                  <CalendarPlus size={16} strokeWidth={2.2} aria-hidden />
                </span>
                일정
              </button>
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${pos[0]},${pos[1]}`}
              target="_blank"
              rel="noreferrer"
              className="popup-action"
            >
              <span className="popup-action__icon">
                <MapIcon size={16} strokeWidth={2.2} aria-hidden />
              </span>
              구글 지도
            </a>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

// Leaflet은 SSR 미지원 -> "use client" + 부모에서 dynamic(ssr:false) 로 로드
const MapView = forwardRef<LeafletMap, MapViewProps>(function MapView(
  {
    onReady,
    pins = [],
    dayRoutes = [],
    currentUserId = "",
    initialCenter = DEFAULT_CENTER,
    initialZoom = DEFAULT_ZOOM,
    searchTarget,
    onSearchTargetAdd,
    onSearchTargetClose,
    onPinDelete,
    onPinEdit,
    onSavePlace,
    onAddToSchedule,
    className,
  },
  ref
) {
  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      zoomControl={false}
      ref={ref}
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      <GoogleBaseLayer />
      <PoiTapLayer onAddToSchedule={onAddToSchedule} onSavePlace={onSavePlace} />
      {onReady && <MapReadyBridge onReady={onReady} />}
      {/* 확대·축소 단추 — 마우스 화면에서만 보인다(손가락 화면은 벌려서 확대) */}
      <ZoomControl position="bottomright" />
      <LocateButton />
      {searchTarget && (
        <SearchTargetMarker
          target={searchTarget}
          onAdd={onSearchTargetAdd}
          onSchedule={onAddToSchedule}
          onClose={onSearchTargetClose}
        />
      )}
      {/* 일자별 동선 — 핀보다 아래(선이 핀을 가리지 않게). 선을 누르면 며칠째인지 알려 준다. */}
      {dayRoutes.map((route) => (
        <Polyline
          key={route.date}
          positions={route.points}
          pathOptions={{
            color: route.color,
            weight: 3.5,
            opacity: 0.85,
            dashArray: "1 9",
            lineCap: "round",
            lineJoin: "round",
            // 선을 누른 손짓이 지도까지 내려가면 "그 자리에 뭐가 있나" 카드가 같이 떠 버린다
            bubblingMouseEvents: false,
          }}
        >
          <Popup>
            <span className="text-sm font-semibold" style={{ color: route.color }}>
              {route.label}
            </span>
            <span className="ml-1 text-xs text-[var(--text-muted)]">
              {route.points.length}곳 동선
            </span>
          </Popup>
        </Polyline>
      ))}
      {pins.map((pin) => (
        <PinMarker
          key={pin.id}
          pin={pin}
          isMine={!pin.createdBy || !currentUserId || pin.createdBy === currentUserId}
          onDelete={onPinDelete}
          onEdit={onPinEdit}
          onAddToSchedule={onAddToSchedule}
        />
      ))}
    </MapContainer>
  );
});

function MapReadyBridge({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

// 내 위치 버튼 — 여행 중 "지금 나 어디지?"를 한 번에. 위치 표시는 파란 점.
function LocateButton() {
  const map = useMap();
  const markerRef = useRef<L.CircleMarker | null>(null);
  const [busy, setBusy] = useState(false);

  const locate = () => {
    if (!navigator.geolocation || busy) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        if (markerRef.current) markerRef.current.remove();
        markerRef.current = L.circleMarker(ll, {
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#3d79c0",
          fillOpacity: 1,
        }).addTo(map);
        map.setView(ll, Math.max(map.getZoom(), 15), { animate: true });
        setBusy(false);
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <button
      type="button"
      onClick={locate}
      disabled={busy}
      className="map-locate-btn"
      aria-label="내 위치로 이동"
    >
      <LocateFixed
        size={19}
        strokeWidth={2.2}
        className={`mx-auto text-[var(--accent-ink)] ${busy ? "animate-spin" : ""}`}
        aria-hidden
      />
    </button>
  );
}

// 검색으로 찾은 자리 표식 — 물결이 퍼지는 파란 점. 그 가게의 종류·여는 시간·전화·주소를
// 조용히 알아봐 말풍선에 채워 주고, 핀 저장·일정·구글 지도로 바로 이어 준다.
function SearchTargetMarker({
  target,
  onAdd,
  onSchedule,
  onClose,
}: {
  target: { lat: number; lng: number; name: string; address?: string };
  onAdd?: () => void;
  onSchedule?: MapViewProps["onAddToSchedule"];
  onClose?: () => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const details = usePlaceDetails(target.lat, target.lng);
  // 옆 가게 정보를 잘못 붙이지 않게 — 아주 가깝거나(30m) 이름이 겹칠 때만 그 가게 것으로 믿는다
  const detail =
    details?.kind === "poi" &&
    (metersApart(target.lat, target.lng, details.lat, details.lng) <= 30 ||
      namesOverlap(target.name, details.name))
      ? details
      : null;
  const address =
    target.address ?? (details?.kind === "address" ? details.name : undefined);

  const icon = L.divIcon({
    className: "search-target-icon",
    html: `<div class="search-dot"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });

  // 찾자마자 이름 말풍선을 펼쳐 "여기예요"를 알려준다.
  useEffect(() => {
    const timer = setTimeout(() => markerRef.current?.openPopup(), 350);
    return () => clearTimeout(timer);
  }, [target.lat, target.lng]);

  // 정보가 뒤늦게 도착하면 말풍선 크기와 자리를 다시 잡는다
  useEffect(() => {
    markerRef.current?.getPopup()?.update();
  }, [details]);

  return (
    <Marker
      position={[target.lat, target.lng]}
      icon={icon}
      title={target.name}
      alt={target.name}
      zIndexOffset={500}
      ref={(m) => {
        markerRef.current = m as L.Marker | null;
      }}
    >
      <Popup className="pin-popup">
        <div className="min-w-[200px] max-w-[250px]">
          <div className="font-semibold text-[var(--text)]">{target.name}</div>
          {(detail?.category || address) && (
            <div className="mt-0.5 text-xs text-[var(--text-muted)]">
              {[detail?.category, address].filter(Boolean).join(" · ")}
            </div>
          )}
          {detail?.hours && <HoursLine spec={detail.hours} lng={target.lng} />}
          {detail?.phone && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Phone size={11} aria-hidden className="shrink-0" />
              <span className="min-w-0 truncate">{detail.phone}</span>
            </div>
          )}
          <div className="popup-actions">
            {onAdd && (
              <button type="button" onClick={onAdd} className="popup-action popup-action--accent">
                <span className="popup-action__icon">
                  <MapPinPlus size={16} strokeWidth={2.2} aria-hidden />
                </span>
                핀 저장
              </button>
            )}
            {onSchedule && (
              <button
                type="button"
                onClick={() =>
                  onSchedule({ lat: target.lat, lng: target.lng, name: target.name })
                }
                className="popup-action"
              >
                <span className="popup-action__icon">
                  <CalendarPlus size={16} strokeWidth={2.2} aria-hidden />
                </span>
                일정
              </button>
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                address ? `${target.name} ${address}` : `${target.lat},${target.lng}`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="popup-action"
            >
              <span className="popup-action__icon">
                <MapIcon size={16} strokeWidth={2.2} aria-hidden />
              </span>
              구글 지도
            </a>
            {onClose && (
              <button type="button" onClick={onClose} className="popup-action">
                <span className="popup-action__icon">
                  <X size={16} strokeWidth={2.2} aria-hidden />
                </span>
                지우기
              </button>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

function PinMarker({
  pin,
  isMine,
  onDelete,
  onEdit,
  onAddToSchedule,
}: {
  pin: Pin;
  isMine: boolean;
  onDelete?: (id: string) => void;
  onEdit?: MapViewProps["onPinEdit"];
  onAddToSchedule?: MapViewProps["onAddToSchedule"];
}) {
  const cfg = PIN_TYPES[pin.type];
  // 지우기는 한 번 더 물어본다 — 손이 스쳐 사라지면 되돌릴 길이 없다.
  const [asking, setAsking] = useState(false);

  // 채움 색은 아이콘 안에 직접 써 넣는다. 바깥에서 나중에 칠하면 화면이 다시 그려질 때
  // 마커 조각이 통째로 교체되면서 색이 지워진다. 아이콘도 값이 바뀔 때만 새로 만든다.
  // 모양은 압정(둥근 머리+바늘대) — 구글이 그리는 물방울 핀과 문법이 달라 우리 핀만 바로 보인다.
  const icon = useMemo(
    () =>
      L.divIcon({
        className: isMine ? "pin-icon" : "pin-icon pin-icon--other",
        html: `<span style="background:${cfg.color}"><i>${pinMarkerSvg(pin.type, 15)}</i></span>`,
        iconSize: [34, 42],
        iconAnchor: [17, 42],
        popupAnchor: [0, -42],
      }),
    [isMine, cfg.color, pin.type]
  );

  return (
    <Marker
      position={[pin.lat, pin.lng]}
      icon={icon}
      // 핀은 키보드로도 고를 수 있는 단추다 — 이름이 없으면 읽어 주는 프로그램이
      // "단추"라고만 말한다. 이름을 붙여 어떤 핀인지 들리게 한다.
      // 끌기는 아예 잠가 둔다 — 지도를 밀던 손가락에 핀이 딸려 가는 사고의 뿌리였다.
      // 자리가 틀린 핀은 지우고 다시 꽂는 게 길이다.
      title={pin.name}
      alt={pin.name}
    >
      <Popup className="pin-popup">
        <div className="min-w-[190px] max-w-[230px]">
          <div className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
            <cfg.Icon size={15} color={cfg.color} aria-hidden className="shrink-0" />
            <span>{pin.name}</span>
            {pin.isAI && (
              <span className="rounded bg-[var(--accent-soft)] px-1 text-[10px] font-medium text-[var(--accent)]">
                AI
              </span>
            )}
            {!isMine && (
              <span className="rounded bg-[var(--surface-hover)] px-1 text-[10px] font-medium text-[var(--text-muted)]">
                친구
              </span>
            )}
          </div>
          {pin.memo && (
            <div className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-muted)]">
              {pin.memo}
            </div>
          )}
          {pin.address && (
            <div className="mt-1 flex items-start gap-1 text-xs text-[var(--text-faint)]">
              <MapPin size={11} aria-hidden className="mt-0.5 shrink-0" />
              <span className="min-w-0">{pin.address}</span>
            </div>
          )}
          {pin.sources?.[0] && (
            <a
              href={pin.sources[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1 text-xs text-[var(--text-faint)]"
            >
              <Link2 size={11} aria-hidden className="shrink-0" />
              <span className="min-w-0 truncate underline underline-offset-2">
                {pin.sources[0].title}
              </span>
            </a>
          )}
          {asking ? (
            <div className="popup-actions items-center">
              <span className="min-w-0 flex-1 text-xs text-[var(--text-muted)]">
                {isMine ? "지울까요?" : "친구 핀이에요. 지울까요?"}
              </span>
              <button
                type="button"
                onClick={() => setAsking(false)}
                className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  setAsking(false);
                  onDelete?.(pin.id);
                }}
                className="rounded-md bg-[var(--danger)] px-2 py-1 text-xs font-bold text-white"
              >
                지우기
              </button>
            </div>
          ) : (
            <div className="popup-actions">
              {onAddToSchedule && (
                <button
                  type="button"
                  onClick={() =>
                    onAddToSchedule({
                      lat: pin.lat,
                      lng: pin.lng,
                      name: pin.name,
                      pinId: pin.id,
                    })
                  }
                  className="popup-action popup-action--accent"
                >
                  <span className="popup-action__icon">
                    <CalendarPlus size={16} strokeWidth={2.2} aria-hidden />
                  </span>
                  일정
                </button>
              )}
              <a
                href={googleMapsUrl(pin)}
                target="_blank"
                rel="noopener noreferrer"
                className="popup-action"
              >
                <span className="popup-action__icon">
                  <MapIcon size={16} strokeWidth={2.2} aria-hidden />
                </span>
                구글 지도
              </a>
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(pin)}
                  className="popup-action"
                >
                  <span className="popup-action__icon">
                    <Pencil size={16} strokeWidth={2.2} aria-hidden />
                  </span>
                  수정
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => setAsking(true)}
                  className="popup-action popup-action--danger"
                >
                  <span className="popup-action__icon">
                    <Trash2 size={16} strokeWidth={2.2} aria-hidden />
                  </span>
                  삭제
                </button>
              )}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

export default MapView;
