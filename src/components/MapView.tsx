"use client";

import { forwardRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L, { type Map as LeafletMap } from "leaflet";
import type { Pin } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";

export type MapViewHandle = LeafletMap | null;

interface MapViewProps {
  onReady?: (map: LeafletMap) => void;
  pins?: Pin[];
  /** 지금 이 브라우저 사용자 ID — 내 핀/남의 핀 구분용. 빈 값이면 전부 내 핀 취급. */
  currentUserId?: string;
  onPinDelete?: (id: string) => void;
  onPinDragEnd?: (id: string, lat: number, lng: number) => void;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
}

const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// Leaflet은 SSR 미지원 -> "use client" + 부모에서 dynamic(ssr:false) 로 로드
const MapView = forwardRef<LeafletMap, MapViewProps>(function MapView(
  {
    onReady,
    pins = [],
    currentUserId = "",
    onPinDelete,
    onPinDragEnd,
    onMapClick,
    className,
  },
  ref
) {
  const center: [number, number] = [35.6762, 139.6503];

  return (
    <MapContainer
      center={center}
      zoom={12}
      ref={ref}
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
      {onReady && <MapReadyBridge onReady={onReady} />}
      <MapEventHandler onMapClick={onMapClick} />
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
              <span className="rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-500">
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
