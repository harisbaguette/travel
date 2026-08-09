"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarPlus,
  Clock,
  Link2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  MapPinPlus,
  Minus,
  Pencil,
  Phone,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { Pin } from "@/lib/types";
import { PIN_TYPES, pinMarkerSvg } from "@/lib/pinTypes";
import { googleMapsUrl, placeSearchUrl } from "@/lib/mapLinks";
import { importMapsLibrary } from "@/lib/googleMaps";
import { splitMemoLines } from "@/lib/memoLines";

/** 하루치 동선 — 일정 화면에서 짠 순서대로 핀 자리를 이은 선 하나. */
export interface DayRoute {
  date: string;
  label: string; // "1일차" 같은 이름
  color: string;
  points: [number, number][]; // 방문 순서대로의 [위도, 경도]
}

/** 부모(page.tsx)가 지도를 움직일 때 잡는 손잡이 — 지도 속살을 밖으로 내보내지 않는다. */
export interface MapHandle {
  setView(
    center: [number, number] | google.maps.LatLngLiteral,
    zoom: number,
    opts?: { animate?: boolean }
  ): void;
  getCenter(): { lat: number; lng: number };
  getZoom(): number;
  /** [[남,서],[북,동]] 네모가 다 보이게 맞춘다. */
  fitBounds(
    bounds: [[number, number], [number, number]],
    opts?: { padding?: [number, number]; maxZoom?: number; animate?: boolean }
  ): void;
  /** 지도를 다 움직이고 멈출 때마다 부른다. */
  onMoveEnd(cb: () => void): void;
}

interface MapViewProps {
  onReady?: (map: MapHandle) => void;
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

const DEFAULT_CENTER: [number, number] = [10.2899, 103.984]; // 푸꾸옥
const DEFAULT_ZOOM = 11;

/** 지도 위에 한 번에 하나만 떠 있게 하는 말풍선 자리표. */
type Registry = { current: google.maps.InfoWindow | null };

/** 처음 받은 값만 붙잡아 둔다 — 만들 때 한 번 쓰고 마는 설정용. */
function useInitial<T>(value: T): T {
  const [initial] = useState(value);
  return initial;
}

function toLatLng(
  c: [number, number] | google.maps.LatLngLiteral
): google.maps.LatLngLiteral {
  return Array.isArray(c) ? { lat: c[0], lng: c[1] } : c;
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

// ────────────────────────────────────────────────────────────────────────────
// 표식 + 말풍선 한 벌 — 말풍선 속은 createPortal로 우리 화면 부품을 그대로 그린다.
// icon을 주면 표식이 생기고(누르면 열림), 안 주면 그 자리에 말풍선만 뜬다.
// ────────────────────────────────────────────────────────────────────────────
interface MapPopupProps {
  map: google.maps.Map;
  registry: Registry;
  lat: number;
  lng: number;
  icon?: google.maps.Icon;
  title?: string;
  zIndex?: number;
  opacity?: number;
  /** 말풍선을 표식 위로 몇 픽셀 더 올릴지 */
  offsetY?: number;
  /** 값이 0보다 크면 그 값이 바뀔 때마다 말풍선을 연다 */
  openSignal?: number;
  onClose?: () => void;
  children: ReactNode;
}

function MapPopup({
  map,
  registry,
  lat,
  lng,
  icon,
  title,
  zIndex,
  opacity,
  offsetY = 0,
  openSignal = 0,
  onClose,
  children,
}: MapPopupProps) {
  const [host] = useState<HTMLDivElement | null>(() =>
    typeof document === "undefined" ? null : document.createElement("div")
  );
  const markerRef = useRef<google.maps.Marker | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const openRef = useRef<() => void>(() => {});
  const onCloseRef = useRef(onClose);
  const posRef = useRef({ lat, lng });

  // 지금 자리와 닫기 손잡이를 늘 최신으로 — 아래 효과들이 이 값을 꺼내 쓴다.
  // (화면을 그리는 중에 고치면 안 되므로 그리기가 끝난 뒤에 옮겨 담는다.)
  useEffect(() => {
    posRef.current = { lat, lng };
    onCloseRef.current = onClose;
  });

  // 만들 때 한 번만 쓰는 값들 — 나중에 바뀌면 아래 갱신 효과가 따로 고쳐 준다.
  const initIcon = useInitial(icon);
  const initTitle = useInitial(title);
  const initZ = useInitial(zIndex);
  const initOpacity = useInitial(opacity);
  const initOffsetY = useInitial(offsetY);

  useEffect(() => {
    if (!host) return;
    const info = new google.maps.InfoWindow({
      content: host,
      maxWidth: 280,
      pixelOffset: new google.maps.Size(0, -initOffsetY),
    });
    infoRef.current = info;
    // simplify: Map ID를 만들 수 있게 되면 AdvancedMarkerElement로 올린다.
    //           지금 열쇠로는 Map ID를 못 만들어 구버전 표식(google.maps.Marker)을 쓴다.
    const marker = initIcon
      ? new google.maps.Marker({
          map,
          position: posRef.current,
          icon: initIcon,
          title: initTitle,
          zIndex: initZ,
          opacity: initOpacity,
        })
      : null;
    markerRef.current = marker;

    const open = () => {
      if (registry.current && registry.current !== info) registry.current.close();
      registry.current = info;
      if (marker) info.open({ map, anchor: marker });
      else {
        info.setPosition(posRef.current);
        info.open({ map });
      }
    };
    openRef.current = open;

    const listeners: google.maps.MapsEventListener[] = [];
    if (marker) listeners.push(marker.addListener("click", open));
    listeners.push(
      info.addListener("closeclick", () => {
        if (registry.current === info) registry.current = null;
        onCloseRef.current?.();
      })
    );
    return () => {
      for (const l of listeners) l.remove();
      info.close();
      marker?.setMap(null);
      if (registry.current === info) registry.current = null;
      infoRef.current = null;
      markerRef.current = null;
    };
  }, [map, host, registry, initIcon, initTitle, initZ, initOpacity, initOffsetY]);

  useEffect(() => {
    markerRef.current?.setPosition({ lat, lng });
    infoRef.current?.setPosition({ lat, lng });
  }, [lat, lng]);

  useEffect(() => {
    if (icon) markerRef.current?.setIcon(icon);
  }, [icon]);

  useEffect(() => {
    if (title !== undefined) markerRef.current?.setTitle(title);
  }, [title]);

  useEffect(() => {
    if (openSignal > 0) openRef.current();
  }, [openSignal]);

  return host ? createPortal(children, host) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// 우리가 만든 HTML 조각을 지도 위 제자리에 붙여 두는 층 — 물결이 퍼지는 검색 점처럼
// 그림(SVG) 한 장으로는 못 만드는 움직임을 살리려고 쓴다.
// ────────────────────────────────────────────────────────────────────────────
function useHtmlOverlay(
  map: google.maps.Map,
  el: HTMLElement | null,
  lat: number,
  lng: number
): void {
  useEffect(() => {
    if (!el) return;
    const node = el;
    class Spot extends google.maps.OverlayView {
      onAdd() {
        this.getPanes()?.overlayMouseTarget.appendChild(node);
      }
      draw() {
        const p = this.getProjection()?.fromLatLngToDivPixel(
          new google.maps.LatLng(lat, lng)
        );
        if (!p) return;
        node.style.position = "absolute";
        node.style.left = `${p.x}px`;
        node.style.top = `${p.y}px`;
        node.style.transform = "translate(-50%, -50%)";
      }
      onRemove() {
        node.remove();
      }
    }
    const spot = new Spot();
    spot.setMap(map);
    return () => spot.setMap(null);
  }, [map, el, lat, lng]);
}

// ────────────────────────────────────────────────────────────────────────────
// 구글이 알려 주는 가게 정보 — 구글맵 앱 카드와 같은 재료.
// ────────────────────────────────────────────────────────────────────────────
interface PlaceInfo {
  name: string;
  lat: number;
  lng: number;
  photo?: string;
  rating?: number;
  ratingCount?: number;
  price?: string;
  category?: string;
  address?: string;
  openNow?: boolean;
  todayHours?: string;
  phone?: string;
  website?: string;
  closed?: string;
}

// 가게 정보를 물을 때 받아 오는 항목들 — 구글맵 카드에 그대로 쓰는 것만.
const PLACE_FIELDS = [
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "priceLevel",
  "regularOpeningHours",
  "utcOffsetMinutes",
  "photos",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteURI",
  "primaryTypeDisplayName",
  "types",
  "businessStatus",
];

// 가격대 — 구글이 주는 등급을 화폐 기호 개수로 보여 준다(구글맵 앱과 같은 문법).
const PRICE_MARK: Record<string, string> = {
  FREE: "무료",
  INEXPENSIVE: "₩",
  MODERATE: "₩₩",
  EXPENSIVE: "₩₩₩",
  VERY_EXPENSIVE: "₩₩₩₩",
};

const BUSINESS_CLOSED: Record<string, string> = {
  CLOSED_TEMPORARILY: "임시 휴업",
  CLOSED_PERMANENTLY: "영업 종료",
};

// 오늘 줄 고르기 — 구글은 월요일부터 일곱 줄을 한국어로 준다.
// simplify: 보는 사람 기기의 요일로 고른다(현지와 하루 차이가 날 수 있음).
function todayHoursLine(
  hours: google.maps.places.OpeningHours | null | undefined
): string | undefined {
  const lines = hours?.weekdayDescriptions;
  if (!lines || lines.length < 7) return undefined;
  return lines[(new Date().getDay() + 6) % 7];
}

async function readPlace(place: google.maps.places.Place): Promise<PlaceInfo | null> {
  const name = place.displayName ?? "";
  const loc = place.location;
  if (!name || !loc) return null;
  let openNow: boolean | undefined;
  try {
    openNow = await place.isOpen();
  } catch {
    // 영업 중인지 못 구하면 그 줄은 아예 빼 둔다(어림짐작 금지)
  }
  const price = place.priceLevel ? PRICE_MARK[place.priceLevel] : undefined;
  return {
    name,
    lat: loc.lat(),
    lng: loc.lng(),
    photo: place.photos?.[0]?.getURI({ maxWidth: 400 }),
    rating: place.rating ?? undefined,
    ratingCount: place.userRatingCount ?? undefined,
    price,
    category: place.primaryTypeDisplayName ?? undefined,
    address: place.formattedAddress ?? undefined,
    openNow,
    todayHours: todayHoursLine(place.regularOpeningHours),
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? undefined,
    website: place.websiteURI ?? undefined,
    closed: place.businessStatus ? BUSINESS_CLOSED[place.businessStatus] : undefined,
  };
}

/** 가게 카드 속살 — 사진 → 이름 → ★평점(리뷰수)·종류·가격대 → 영업 여부 → 전화 → 웹사이트. */
function PlaceCardBody({ info }: { info: PlaceInfo }) {
  const meta = [
    info.category,
    info.price,
  ].filter(Boolean) as string[];
  return (
    <>
      {info.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="map-popup__photo" src={info.photo} alt="" loading="lazy" />
      )}
      <div className="map-popup__title font-semibold text-[var(--text)]">{info.name}</div>
      {(info.rating !== undefined || meta.length > 0) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-[var(--text-muted)]">
          {info.rating !== undefined && (
            <span className="flex items-center gap-0.5">
              <Star size={11} aria-hidden className="shrink-0 fill-[#f2a93b] text-[#f2a93b]" />
              <span className="font-semibold text-[var(--text)]">
                {info.rating.toFixed(1)}
              </span>
              {info.ratingCount !== undefined && <span>({info.ratingCount})</span>}
            </span>
          )}
          {meta.length > 0 && <span>{meta.join(" · ")}</span>}
        </div>
      )}
      {info.closed && (
        <div className="mt-0.5 text-xs font-semibold text-[var(--danger)]">{info.closed}</div>
      )}
      {(info.openNow !== undefined || info.todayHours) && (
        <div className="mt-1 flex items-start gap-1 text-xs text-[var(--text-muted)]">
          <Clock size={11} aria-hidden className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            {info.openNow !== undefined && (
              <>
                <span
                  className={
                    info.openNow
                      ? "font-semibold text-[#0e7a4f]"
                      : "font-semibold text-[var(--danger)]"
                  }
                >
                  {info.openNow ? "영업 중" : "영업 준비 중"}
                </span>
                {info.todayHours && <br />}
              </>
            )}
            {info.todayHours}
          </span>
        </div>
      )}
      {info.phone && (
        <div className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)]">
          <Phone size={11} aria-hidden className="shrink-0" />
          <span className="min-w-0 truncate">{info.phone}</span>
        </div>
      )}
      {info.website && (
        <a
          href={info.website}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-faint)]"
        >
          <Link2 size={11} aria-hidden className="shrink-0" />
          <span className="min-w-0 truncate underline underline-offset-2">웹사이트</span>
        </a>
      )}
    </>
  );
}

/** 말풍선 아래 동작 줄 — 핀 저장 / 일정 / 구글 지도. */
function PlaceActions({
  lat,
  lng,
  name,
  onSavePlace,
  onAddToSchedule,
  onDone,
}: {
  lat: number;
  lng: number;
  name: string;
  onSavePlace?: MapViewProps["onSavePlace"];
  onAddToSchedule?: MapViewProps["onAddToSchedule"];
  onDone: () => void;
}) {
  return (
    <div className="popup-actions">
      {onSavePlace && (
        <button
          type="button"
          onClick={() => {
            onSavePlace({ lat, lng, name });
            onDone();
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
          onClick={() => onAddToSchedule({ lat, lng, name })}
          className="popup-action"
        >
          <span className="popup-action__icon">
            <CalendarPlus size={16} strokeWidth={2.2} aria-hidden />
          </span>
          일정
        </button>
      )}
      <a
        href={placeSearchUrl(name, lat, lng)}
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
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 지도 누르는 손맛 — 구글맵과 똑같이 세 가지로 나눈다.
// · 구글이 그려 둔 가게를 누르면 → 그 가게 카드(사진·별점·영업시간·전화)
// · 빈 땅을 누르면 → 열려 있던 카드만 닫힌다
// · 길게 누르거나 마우스 오른쪽 → 빨간 물방울 핀 + 그 자리 주소
// ────────────────────────────────────────────────────────────────────────────
type TapCard =
  | { type: "poi"; placeId: string; lat: number; lng: number }
  | { type: "drop"; lat: number; lng: number };

// 떨어뜨린 핀 그림 — 구글맵의 빨간 물방울 핀과 같은 문법.
const DROP_PIN_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="27" height="43" viewBox="0 0 27 43">` +
  `<path fill="#EA4335" stroke="#B31412" stroke-width="1" d="M13.5 .5C6.3 .5 .5 6.3 .5 13.5c0 9.8 13 29 13 29s13-19.2 13-29C26.5 6.3 20.7 .5 13.5 .5Z"/>` +
  `<circle cx="13.5" cy="13.5" r="4.6" fill="#7B231E"/></svg>`;

function PoiTapLayer({
  map,
  registry,
  onSavePlace,
  onAddToSchedule,
}: {
  map: google.maps.Map;
  registry: Registry;
  onSavePlace?: MapViewProps["onSavePlace"];
  onAddToSchedule?: MapViewProps["onAddToSchedule"];
}) {
  const [card, setCard] = useState<TapCard | null>(null);

  useEffect(() => {
    const onClick = map.addListener("click", (e: google.maps.IconMouseEvent) => {
      // 구글이 그려 둔 가게를 눌렀다 — 구글 기본 카드는 막고 우리 카드를 띄운다.
      if (e.placeId && e.latLng) {
        e.stop();
        setCard({
          type: "poi",
          placeId: e.placeId,
          lat: e.latLng.lat(),
          lng: e.latLng.lng(),
        });
        return;
      }
      // 빈 땅 — 떠 있던 카드만 치운다(좌표 카드는 만들지 않는다).
      // 핀 말풍선처럼 우리가 안 만든 카드도 같이 닫는다(예전 지도와 같은 손맛).
      registry.current?.close();
      registry.current = null;
      setCard(null);
    });
    const onContext = map.addListener(
      "contextmenu",
      (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        setCard({ type: "drop", lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    );
    return () => {
      onClick.remove();
      onContext.remove();
    };
  }, [map, registry]);

  if (!card) return null;
  if (card.type === "poi")
    return (
      <PoiCard
        key={card.placeId}
        map={map}
        registry={registry}
        placeId={card.placeId}
        lat={card.lat}
        lng={card.lng}
        onSavePlace={onSavePlace}
        onAddToSchedule={onAddToSchedule}
        onClose={() => setCard(null)}
      />
    );
  return (
    <DropPinCard
      key={`${card.lat},${card.lng}`}
      map={map}
      registry={registry}
      lat={card.lat}
      lng={card.lng}
      onSavePlace={onSavePlace}
      onAddToSchedule={onAddToSchedule}
      onClose={() => setCard(null)}
    />
  );
}

function PoiCard({
  map,
  registry,
  placeId,
  lat,
  lng,
  onSavePlace,
  onAddToSchedule,
  onClose,
}: {
  map: google.maps.Map;
  registry: Registry;
  placeId: string;
  lat: number;
  lng: number;
  onSavePlace?: MapViewProps["onSavePlace"];
  onAddToSchedule?: MapViewProps["onAddToSchedule"];
  onClose: () => void;
}) {
  const [info, setInfo] = useState<PlaceInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { Place } = await importMapsLibrary("places");
        const place = new Place({ id: placeId });
        await place.fetchFields({ fields: PLACE_FIELDS });
        const read = await readPlace(place);
        if (!cancelled && read) setInfo(read);
      } catch {
        // 못 물어보면 카드 뼈대(이름 자리)는 그대로 두고 조용히 넘어간다
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  const name = info?.name ?? "";
  return (
    <MapPopup
      map={map}
      registry={registry}
      lat={info?.lat ?? lat}
      lng={info?.lng ?? lng}
      offsetY={14}
      openSignal={1}
      onClose={onClose}
    >
      <div className="map-popup">
        {info ? (
          <PlaceCardBody info={info} />
        ) : (
          <div className="map-popup__title text-sm text-[var(--text-muted)]">
            알아보는 중…
          </div>
        )}
        {info && (
          <PlaceActions
            lat={info.lat}
            lng={info.lng}
            name={name}
            onSavePlace={onSavePlace}
            onAddToSchedule={onAddToSchedule}
            onDone={onClose}
          />
        )}
      </div>
    </MapPopup>
  );
}

function DropPinCard({
  map,
  registry,
  lat,
  lng,
  onSavePlace,
  onAddToSchedule,
  onClose,
}: {
  map: google.maps.Map;
  registry: Registry;
  lat: number;
  lng: number;
  onSavePlace?: MapViewProps["onSavePlace"];
  onAddToSchedule?: MapViewProps["onAddToSchedule"];
  onClose: () => void;
}) {
  const [address, setAddress] = useState<string | null>(null);

  // 주소는 구글 주소찾기(Geocoder)에게 브라우저에서 직접 묻는다.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        const { Geocoder } = await importMapsLibrary("geocoding");
        const { results } = await new Geocoder().geocode({
          location: { lat, lng },
          language: "ko",
        });
        if (!cancelled) setAddress(results[0]?.formatted_address ?? fallback);
      } catch {
        if (!cancelled) setAddress(fallback);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const icon = useMemo<google.maps.Icon>(
    () => ({
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(DROP_PIN_SVG)}`,
      scaledSize: new google.maps.Size(27, 43),
      anchor: new google.maps.Point(13, 43),
    }),
    []
  );

  const name = address ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return (
    <MapPopup
      map={map}
      registry={registry}
      lat={lat}
      lng={lng}
      icon={icon}
      zIndex={400}
      openSignal={1}
      onClose={onClose}
    >
      <div className="map-popup">
        <div className="map-popup__title font-semibold text-[var(--text)]">
          떨어뜨린 핀
        </div>
        <div className="mt-0.5 flex items-start gap-1 text-xs text-[var(--text-muted)]">
          <MapPin size={11} aria-hidden className="mt-0.5 shrink-0" />
          <span className="min-w-0">{address ?? "주소 알아보는 중…"}</span>
        </div>
        <PlaceActions
          lat={lat}
          lng={lng}
          name={name}
          onSavePlace={onSavePlace}
          onAddToSchedule={onAddToSchedule}
          onDone={onClose}
        />
      </div>
    </MapPopup>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 검색으로 찾은 자리 — 물결이 퍼지는 파란 점. 그 가게 정보는 구글 장소에 이름+근처로 묻는다.
// ────────────────────────────────────────────────────────────────────────────
function SearchTargetMarker({
  map,
  registry,
  target,
  onAdd,
  onSchedule,
  onClose,
}: {
  map: google.maps.Map;
  registry: Registry;
  target: { lat: number; lng: number; name: string; address?: string };
  onAdd?: () => void;
  onSchedule?: MapViewProps["onAddToSchedule"];
  onClose?: () => void;
}) {
  const [host] = useState<HTMLDivElement | null>(() =>
    typeof document === "undefined" ? null : document.createElement("div")
  );
  const [openTick, setOpenTick] = useState(1);
  const [info, setInfo] = useState<PlaceInfo | null>(null);
  useHtmlOverlay(map, host, target.lat, target.lng);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { Place } = await importMapsLibrary("places");
        const { places } = await Place.searchByText({
          textQuery: target.name,
          fields: PLACE_FIELDS,
          locationBias: {
            center: { lat: target.lat, lng: target.lng },
            radius: 100,
          },
          maxResultCount: 1,
          language: "ko",
        });
        const found = places[0] ? await readPlace(places[0]) : null;
        // 옆 가게 정보를 잘못 붙이지 않게 — 아주 가깝거나(30m) 이름이 겹칠 때만 믿는다
        if (
          !cancelled &&
          found &&
          (metersApart(target.lat, target.lng, found.lat, found.lng) <= 30 ||
            namesOverlap(target.name, found.name))
        )
          setInfo(found);
      } catch {
        // 못 찾으면 이름만 보여 준다
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target.lat, target.lng, target.name]);

  const address = target.address ?? info?.address;

  return (
    <>
      {host &&
        createPortal(
          <div
            className="search-dot"
            role="button"
            tabIndex={0}
            aria-label={target.name}
            onClick={() => setOpenTick((t) => t + 1)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setOpenTick((t) => t + 1);
            }}
          />,
          host
        )}
      <MapPopup
        map={map}
        registry={registry}
        lat={target.lat}
        lng={target.lng}
        offsetY={12}
        openSignal={openTick}
      >
        <div className="map-popup">
          {info?.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="map-popup__photo" src={info.photo} alt="" loading="lazy" />
          )}
          <div className="map-popup__title font-semibold text-[var(--text)]">
            {target.name}
          </div>
          {info ? (
            <PlaceCardBody info={{ ...info, name: target.name, photo: undefined }} />
          ) : (
            address && (
              <div className="mt-0.5 text-xs text-[var(--text-muted)]">{address}</div>
            )
          )}
          <div className="popup-actions">
            {onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="popup-action popup-action--accent"
              >
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
              href={placeSearchUrl(target.name, target.lat, target.lng)}
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
      </MapPopup>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 내가 꽂은 핀 — 우표 압정 그림(SVG)을 그대로 표식 그림으로 쓴다.
// ────────────────────────────────────────────────────────────────────────────
function PinMarker({
  map,
  registry,
  pin,
  isMine,
  onDelete,
  onEdit,
  onAddToSchedule,
}: {
  map: google.maps.Map;
  registry: Registry;
  pin: Pin;
  isMine: boolean;
  onDelete?: (id: string) => void;
  onEdit?: MapViewProps["onPinEdit"];
  onAddToSchedule?: MapViewProps["onAddToSchedule"];
}) {
  const cfg = PIN_TYPES[pin.type];
  // 지우기는 한 번 더 물어본다 — 손이 스쳐 사라지면 되돌릴 길이 없다.
  const [asking, setAsking] = useState(false);
  // 근거 글은 평소엔 접어 둔다 — 고리 그림을 눌러야 펼쳐진다.
  const [showSources, setShowSources] = useState(false);
  const memoLines = useMemo(() => splitMemoLines(pin.memo), [pin.memo]);
  const sources = pin.sources ?? [];

  // 기울기는 핀마다 고정된 값(-2~2도) — 이름표(id) 글자 합으로 정해져 새로고침해도 같다.
  const icon = useMemo<google.maps.Icon>(() => {
    let sum = 0;
    for (let i = 0; i < pin.id.length; i++) sum += pin.id.charCodeAt(i);
    const svg = pinMarkerSvg(pin.type, (sum % 5) - 2);
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(36, 46),
      anchor: new google.maps.Point(18, 44),
    };
  }, [pin.id, pin.type]);

  return (
    <MapPopup
      map={map}
      registry={registry}
      lat={pin.lat}
      lng={pin.lng}
      icon={icon}
      // 핀은 누를 수 있는 단추다 — 이름을 붙여 읽어 주는 프로그램에도 들리게 한다.
      title={pin.name}
      opacity={isMine ? 1 : 0.78}
      onClose={() => {
        setAsking(false);
        setShowSources(false);
      }}
    >
      <div className="map-popup">
        <div className="map-popup__title flex items-center gap-1.5 font-semibold text-[var(--text)]">
          <cfg.Icon size={15} color={cfg.color} aria-hidden className="shrink-0" />
          <span>{pin.name}</span>
          {pin.isAI && (
            <Sparkles
              size={12}
              role="img"
              aria-label="AI 추천"
              className="shrink-0 text-[var(--text-faint)]"
            />
          )}
          {!isMine && (
            <span className="rounded bg-[var(--surface-hover)] px-1 text-[10px] font-medium text-[var(--text-muted)]">
              친구
            </span>
          )}
        </div>
        {memoLines.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[var(--text-muted)]">
            {memoLines.map((line, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span
                  aria-hidden
                  className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-[var(--text-faint)]"
                />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        )}
        {sources.length > 0 && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setShowSources((v) => !v)}
              aria-expanded={showSources}
              aria-label="추천 근거 글"
              title="추천 근거 글"
              className={`press flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--accent)] ${
                showSources
                  ? "bg-[var(--surface-hover)] text-[var(--accent)]"
                  : "text-[var(--text-faint)]"
              }`}
            >
              <Link2 size={13} strokeWidth={2.2} aria-hidden />
            </button>
            <div className={`dw-fold${showSources ? " is-open" : ""}`}>
              <div className="flex flex-col gap-0.5 pt-1">
                {sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={showSources ? undefined : -1}
                    className="block min-w-0 truncate text-xs text-[var(--text-faint)] underline underline-offset-2"
                  >
                    {source.title}
                  </a>
                ))}
              </div>
            </div>
          </div>
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
    </MapPopup>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 일자별 동선 — 점을 촘촘히 찍어 만든 점선. 누르면 며칠째인지 알려 준다.
// ────────────────────────────────────────────────────────────────────────────
function DayRouteLine({
  map,
  registry,
  route,
}: {
  map: google.maps.Map;
  registry: Registry;
  route: DayRoute;
}) {
  const [openAt, setOpenAt] = useState<google.maps.LatLngLiteral | null>(null);
  const path = useMemo(
    () => route.points.map(([lat, lng]) => ({ lat, lng })),
    [route.points]
  );

  useEffect(() => {
    const line = new google.maps.Polyline({
      map,
      path,
      // 선 자체는 안 그리고 동그란 점만 촘촘히 찍는다 — Leaflet의 점선(dashArray)과 같은 모양
      strokeColor: route.color,
      strokeOpacity: 0,
      strokeWeight: 3.5,
      zIndex: 1,
      icons: [
        {
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 2,
            fillColor: route.color,
            fillOpacity: 0.85,
            strokeOpacity: 0,
          },
          offset: "0",
          repeat: "10px",
        },
      ],
    });
    const l = line.addListener("click", (e: google.maps.PolyMouseEvent) => {
      if (e.latLng) setOpenAt(e.latLng.toJSON());
    });
    return () => {
      l.remove();
      line.setMap(null);
    };
  }, [map, path, route.color]);

  if (!openAt) return null;
  return (
    <MapPopup
      key={`${openAt.lat},${openAt.lng}`}
      map={map}
      registry={registry}
      lat={openAt.lat}
      lng={openAt.lng}
      openSignal={1}
      onClose={() => setOpenAt(null)}
    >
      <div className="map-popup">
        <span className="text-sm font-semibold" style={{ color: route.color }}>
          {route.label}
        </span>
        <span className="ml-1 text-xs text-[var(--text-muted)]">
          {route.points.length}곳 동선
        </span>
      </div>
    </MapPopup>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 지도 위 단추 — 확대·축소(마우스 화면만)와 내 위치.
// ────────────────────────────────────────────────────────────────────────────
function MapControls({ map }: { map: google.maps.Map }) {
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      markerRef.current?.setMap(null);
      markerRef.current = null;
    };
  }, []);

  const zoomBy = (step: number) => {
    const z = map.getZoom();
    if (typeof z === "number") map.setZoom(z + step);
  };

  const locate = () => {
    if (!navigator.geolocation || busy) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        markerRef.current?.setMap(null);
        markerRef.current = new google.maps.Marker({
          map,
          position: at,
          zIndex: 300,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#3d79c0",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
        });
        map.setZoom(Math.max(map.getZoom() ?? 15, 15));
        map.panTo(at);
        setBusy(false);
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <>
      <div className="map-zoom-btns">
        <button
          type="button"
          onClick={() => zoomBy(1)}
          className="map-zoom-btn"
          aria-label="지도 확대"
        >
          <Plus size={18} strokeWidth={2.4} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          className="map-zoom-btn"
          aria-label="지도 축소"
        >
          <Minus size={18} strokeWidth={2.4} aria-hidden />
        </button>
      </div>
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
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 지도 본체 — 구글 지도를 직접 만든다. 브라우저에서만 돈다("use client" + dynamic ssr:false).
// ────────────────────────────────────────────────────────────────────────────
const MapView = forwardRef<MapHandle, MapViewProps>(function MapView(
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
  const boxRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [failed, setFailed] = useState(false);
  const registry = useRef<google.maps.InfoWindow | null>(null);

  // 지도는 딱 한 번만 만든다 — 처음 위치·확대는 그때의 값을 쓴다.
  useEffect(() => {
    let cancelled = false;
    let made: google.maps.Map | null = null;
    void (async () => {
      try {
        const { Map: GoogleMap } = await importMapsLibrary("maps");
        if (cancelled || !boxRef.current) return;
        made = new GoogleMap(boxRef.current, {
          center: { lat: initialCenter[0], lng: initialCenter[1] },
          zoom: initialZoom,
          disableDefaultUI: true,
          // 지도 구석의 "키보드 단축키" 표시를 아예 만들지 않는다(손으로 쓰는 화면이라 쓸 일이 없다).
          keyboardShortcuts: false,
          // 이게 꺼지면 구글이 그려 둔 가게를 눌러도 아무 소식이 안 온다 — 이 앱의 핵심이다.
          clickableIcons: true,
          gestureHandling: "greedy",
        });
        setMap(made);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      made = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handle = useMemo<MapHandle>(
    () => ({
      setView(center, zoom, opts) {
        if (!map) return;
        const at = toLatLng(center);
        map.setZoom(zoom);
        if (opts?.animate) map.panTo(at);
        else map.setCenter(at);
      },
      getCenter() {
        const c = map?.getCenter();
        return c
          ? { lat: c.lat(), lng: c.lng() }
          : { lat: initialCenter[0], lng: initialCenter[1] };
      },
      getZoom() {
        return map?.getZoom() ?? initialZoom;
      },
      fitBounds(bounds, opts) {
        if (!map) return;
        const box = new google.maps.LatLngBounds(
          { lat: bounds[0][0], lng: bounds[0][1] },
          { lat: bounds[1][0], lng: bounds[1][1] }
        );
        const pad = opts?.padding;
        map.fitBounds(
          box,
          pad ? { top: pad[1], bottom: pad[1], left: pad[0], right: pad[0] } : undefined
        );
        // 구글에는 "이보다 더 당기지 마라"가 없어서, 다 맞춘 뒤 한 번 되돌린다.
        const max = opts?.maxZoom;
        if (typeof max === "number")
          google.maps.event.addListenerOnce(map, "idle", () => {
            if ((map.getZoom() ?? 0) > max) map.setZoom(max);
          });
      },
      onMoveEnd(cb) {
        map?.addListener("idle", cb);
      },
    }),
    // initialCenter/initialZoom은 첫 값 그대로 쓰는 예비값이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map]
  );

  useImperativeHandle(ref, () => handle, [handle]);

  useEffect(() => {
    if (map && onReady) onReady(handle);
  }, [map, handle, onReady]);

  return (
    <div className={`relative${className ? ` ${className}` : ""}`}>
      <div ref={boxRef} className="absolute inset-0" />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[var(--text-muted)]">
          지도를 불러오지 못했어요 — 잠시 뒤 다시 열어 주세요
        </div>
      )}
      {map && (
        <>
          <MapControls map={map} />
          <PoiTapLayer
            map={map}
            registry={registry}
            onSavePlace={onSavePlace}
            onAddToSchedule={onAddToSchedule}
          />
          {searchTarget && (
            <SearchTargetMarker
              key={`${searchTarget.lat},${searchTarget.lng}`}
              map={map}
              registry={registry}
              target={searchTarget}
              onAdd={onSearchTargetAdd}
              onSchedule={onAddToSchedule}
              onClose={onSearchTargetClose}
            />
          )}
          {dayRoutes.map((route) => (
            <DayRouteLine
              key={route.date}
              map={map}
              registry={registry}
              route={route}
            />
          ))}
          {pins.map((pin) => (
            <PinMarker
              key={pin.id}
              map={map}
              registry={registry}
              pin={pin}
              isMine={
                !pin.createdBy || !currentUserId || pin.createdBy === currentUserId
              }
              onDelete={onPinDelete}
              onEdit={onPinEdit}
              onAddToSchedule={onAddToSchedule}
            />
          ))}
        </>
      )}
    </div>
  );
});

export default MapView;
