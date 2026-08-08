"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { LocateFixed } from "lucide-react";
import L, { type Map as LeafletMap } from "leaflet";
import "@maplibre/maplibre-gl-leaflet";
import "leaflet.gridlayer.googlemutant";
import type { Pin } from "@/lib/types";
import { PIN_TYPES, pinMarkerSvg } from "@/lib/pinTypes";
import { hasGoogleKey, loadGoogleMaps, onGoogleAuthFailure } from "@/lib/googleMaps";

export type MapViewHandle = LeafletMap | null;

interface MapViewProps {
  onReady?: (map: LeafletMap) => void;
  pins?: Pin[];
  /** 지금 이 브라우저 사용자 ID — 내 핀/남의 핀 구분용. 빈 값이면 전부 내 핀 취급. */
  currentUserId?: string;
  /** 처음 보여줄 위치와 확대 정도. */
  initialCenter?: [number, number];
  initialZoom?: number;
  /** 검색으로 찾은 자리 — 파란 점으로 잠시 표시해 둔다. */
  searchTarget?: { lat: number; lng: number; name: string } | null;
  onSearchTargetAdd?: () => void;
  onSearchTargetClose?: () => void;
  onPinDelete?: (id: string) => void;
  onPinDragEnd?: (id: string, lat: number, lng: number) => void;
  className?: string;
}

// 구글 지도 그림 조각(타일) 주소 — 열쇠(API 키)나 계정 없이 바로 받아올 수 있다.
// hl=ko: 지명을 구글맵 앱처럼 한국어로 보여 준다.
// 주의: 구글이 공식으로 열어 둔 문은 아니라서, 언젠가 막히면 아래 무료 지도로 자동 복귀한다.
const GOOGLE_TILE_URL =
  "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko";

// 한국어 라벨이 나오는 무료 벡터 지도(OpenFreeMap). 열쇠(API 키) 없이 쓸 수 있다.
// 확인일 2026-08-08: https://openfreemap.org/quick_start/
const VECTOR_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; OpenMapTiles &copy; OpenStreetMap contributors';
// WebGL이 안 되는 기기용 예비 지도(글자는 현지어로 나옴)
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const DEFAULT_CENTER: [number, number] = [10.2899, 103.984]; // 푸꾸옥
const DEFAULT_ZOOM = 11;

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ?? canvas.getContext("webgl")
    );
  } catch {
    return false;
  }
}

// 지도 글자를 한국어 우선으로 바꾼다 — 한국어 이름이 없으면 현지 이름 그대로.
// 도로 번호판(ref) 같은 글자는 건드리면 깨지므로, name을 쓰는 라벨만 바꾼다.
function applyKoreanLabels(glMap: import("maplibre-gl").Map): void {
  const style = glMap.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const textField = glMap.getLayoutProperty(layer.id, "text-field");
    if (!textField) continue;
    const raw = JSON.stringify(textField);
    if (!raw.includes("name")) continue;
    glMap.setLayoutProperty(layer.id, "text-field", [
      "coalesce",
      ["get", "name:ko"],
      ["get", "name"],
    ]);
  }
}

// 바탕 지도 층 — 구글 열쇠가 있으면 공식 구글 지도를, 없어도 구글 지도 조각을 깐다.
// 순서: 구글 공식(열쇠 있을 때) → 구글 조각(열쇠 없이) → 벡터(무료) → 래스터(예비)
function VectorBaseLayer() {
  const map = useMap();
  const [mode, setMode] = useState<"google" | "gtile" | "vector" | "raster">(
    () => {
      if (typeof window === "undefined") return "gtile";
      return hasGoogleKey() ? "google" : "gtile";
    }
  );
  // 구글 조각을 하나라도 받았는지/몇 번 실패했는지 — 전부 실패면 무료 지도로 되돌린다
  const gtileStateRef = useRef({ loaded: false, errors: 0 });

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

  useEffect(() => {
    if (mode !== "vector") return;
    let cancelled = false;
    let layer: L.MaplibreGL | null = null;
    try {
      layer = L.maplibreGL({ style: VECTOR_STYLE_URL });
      layer.addTo(map);
      map.attributionControl?.addAttribution(OSM_ATTRIBUTION);
      const glMap = layer.getMaplibreMap();
      // 스타일이 다 읽힌 뒤 라벨을 한국어로 교체
      if (glMap.isStyleLoaded()) applyKoreanLabels(glMap);
      else glMap.once("styledata", () => applyKoreanLabels(glMap));
    } catch {
      // 벡터 지도 생성 실패 — 다음 틱에 래스터로 전환(렌더 중 setState 금지 규칙 준수)
      queueMicrotask(() => {
        if (!cancelled) setMode("raster");
      });
    }
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
      map.attributionControl?.removeAttribution(OSM_ATTRIBUTION);
    };
  }, [map, mode]);

  // 열쇠 없는 구글 조각 — 받다가 전부 실패하면(구글이 문을 닫으면) 무료 지도로 되돌린다
  if (mode === "gtile") {
    return (
      <TileLayer
        attribution="&copy; Google"
        url={GOOGLE_TILE_URL}
        subdomains={["0", "1", "2", "3"]}
        maxZoom={20}
        eventHandlers={{
          tileload: () => {
            gtileStateRef.current.loaded = true;
          },
          tileerror: () => {
            const s = gtileStateRef.current;
            s.errors += 1;
            if (!s.loaded && s.errors >= 4) {
              setMode(webglAvailable() ? "vector" : "raster");
            }
          },
        }}
      />
    );
  }
  if (mode === "raster") {
    return <TileLayer attribution="&copy; OpenStreetMap contributors" url={OSM_TILE_URL} />;
  }
  return null;
}

// Leaflet은 SSR 미지원 -> "use client" + 부모에서 dynamic(ssr:false) 로 로드
const MapView = forwardRef<LeafletMap, MapViewProps>(function MapView(
  {
    onReady,
    pins = [],
    currentUserId = "",
    initialCenter = DEFAULT_CENTER,
    initialZoom = DEFAULT_ZOOM,
    searchTarget,
    onSearchTargetAdd,
    onSearchTargetClose,
    onPinDelete,
    onPinDragEnd,
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
      <VectorBaseLayer />
      {onReady && <MapReadyBridge onReady={onReady} />}
      <LocateButton />
      {searchTarget && (
        <SearchTargetMarker
          target={searchTarget}
          onAdd={onSearchTargetAdd}
          onClose={onSearchTargetClose}
        />
      )}
      {pins.map((pin) => (
        <PinMarker
          key={pin.id}
          pin={pin}
          isMine={!pin.createdBy || !currentUserId || pin.createdBy === currentUserId}
          onDelete={onPinDelete}
          onDragEnd={onPinDragEnd}
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

// 검색으로 찾은 자리 표식 — 물결이 퍼지는 파란 점. 말풍선에서 바로 핀으로 저장할 수 있다.
function SearchTargetMarker({
  target,
  onAdd,
  onClose,
}: {
  target: { lat: number; lng: number; name: string };
  onAdd?: () => void;
  onClose?: () => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);

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
      <Popup>
        <div className="min-w-[160px]">
          <div className="mb-2 font-semibold text-[var(--text)]">{target.name}</div>
          <div className="flex items-center gap-1.5">
            {onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-bold text-white"
              >
                핀으로 저장
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
              >
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
  onDragEnd,
}: {
  pin: Pin;
  isMine: boolean;
  onDelete?: (id: string) => void;
  onDragEnd?: (id: string, lat: number, lng: number) => void;
}) {
  const cfg = PIN_TYPES[pin.type];
  // 지우기는 한 번 더 물어본다 — 손이 스쳐 사라지면 되돌릴 길이 없다.
  const [asking, setAsking] = useState(false);

  // 채움 색은 아이콘 안에 직접 써 넣는다. 바깥에서 나중에 칠하면 화면이 다시 그려질 때
  // 마커 조각이 통째로 교체되면서 색이 지워진다. 아이콘도 값이 바뀔 때만 새로 만든다.
  const icon = useMemo(
    () =>
      L.divIcon({
        className: isMine ? "pin-icon" : "pin-icon pin-icon--other",
        html: `<span style="background:${cfg.color}"><i>${pinMarkerSvg(pin.type)}</i></span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      }),
    [isMine, cfg.color, pin.type]
  );

  return (
    <Marker
      position={[pin.lat, pin.lng]}
      icon={icon}
      // 핀은 키보드로도 고를 수 있는 단추다 — 이름이 없으면 읽어 주는 프로그램이
      // "단추"라고만 말한다. 이름을 붙여 어떤 핀인지 들리게 한다.
      title={pin.name}
      alt={pin.name}
      draggable={isMine}
      eventHandlers={{
        dragend(e) {
          const marker = e.target as L.Marker;
          const ll = marker.getLatLng();
          onDragEnd?.(pin.id, ll.lat, ll.lng);
        },
      }}
    >
      <Popup className="pin-popup">
        <div className="min-w-[180px]">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-[var(--text)]">
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
            <p className="mb-2 whitespace-pre-wrap text-xs text-[var(--text-muted)]">
              {pin.memo}
            </p>
          )}
          {pin.sources?.[0] && (
            <a
              href={pin.sources[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 flex items-center gap-1 text-xs text-[var(--text-faint)]"
            >
              <span className="shrink-0">출처:</span>
              <span className="min-w-0 truncate underline underline-offset-2">
                {pin.sources[0].title}
              </span>
            </a>
          )}
          {onDelete &&
            (asking ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--text-muted)]">
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
                    onDelete(pin.id);
                  }}
                  className="rounded-md bg-[var(--danger)] px-2 py-1 text-xs font-bold text-white"
                >
                  지우기
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAsking(true)}
                className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--danger)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                삭제
              </button>
            ))}
        </div>
      </Popup>
    </Marker>
  );
}

export default MapView;
