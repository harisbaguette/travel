"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { LocateFixed } from "lucide-react";
import L, { type Map as LeafletMap } from "leaflet";
import "@maplibre/maplibre-gl-leaflet";
import type { Pin } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";

export type MapViewHandle = LeafletMap | null;

interface MapViewProps {
  onReady?: (map: LeafletMap) => void;
  pins?: Pin[];
  /** 지금 이 브라우저 사용자 ID — 내 핀/남의 핀 구분용. 빈 값이면 전부 내 핀 취급. */
  currentUserId?: string;
  /** 처음 보여줄 위치와 확대 정도. */
  initialCenter?: [number, number];
  initialZoom?: number;
  onPinDelete?: (id: string) => void;
  onPinDragEnd?: (id: string, lat: number, lng: number) => void;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
}

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

// 벡터 지도 층 — Leaflet 지도 위에 MapLibre GL 화면을 얹는다.
function VectorBaseLayer() {
  const map = useMap();
  // WebGL이 안 되면 처음부터 예비 지도(래스터)로 간다.
  const [fallback, setFallback] = useState(
    () => typeof window !== "undefined" && !webglAvailable()
  );

  useEffect(() => {
    if (fallback) return;
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
        if (!cancelled) setFallback(true);
      });
    }
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
      map.attributionControl?.removeAttribution(OSM_ATTRIBUTION);
    };
  }, [map, fallback]);

  if (fallback) {
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
    onPinDelete,
    onPinDragEnd,
    onMapClick,
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
      <MapEventHandler onMapClick={onMapClick} />
      <LocateButton />
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

function MapEventHandler({
  onMapClick,
}: {
  onMapClick?: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
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
  // 내가 찍은 핀은 타입 색 테두리, 다른 사람 핀은 회색 점선 테두리로 한눈에 구분.
  const borderColor = isMine ? cfg.color : "#94a3b8";

  const icon = L.divIcon({
    className: isMine ? "pin-icon" : "pin-icon pin-icon--other",
    html: `<span>${pin.emoji}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });

  const setMarkerColor = (el: HTMLElement | null) => {
    if (!el) return;
    el.style.borderColor = borderColor;
  };

  return (
    <Marker
      position={[pin.lat, pin.lng]}
      icon={icon}
      draggable
      eventHandlers={{
        dragend(e) {
          const marker = e.target as L.Marker;
          const ll = marker.getLatLng();
          onDragEnd?.(pin.id, ll.lat, ll.lng);
        },
      }}
      ref={(m) => {
        const el = (m as L.Marker | null)?.getElement() ?? null;
        setMarkerColor(el);
      }}
    >
      <Popup className="pin-popup">
        <div className="min-w-[180px]">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-[var(--text)]">
            <span>{pin.emoji}</span>
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
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(pin.id)}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--danger)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              삭제
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

export default MapView;
