"use client";

import { forwardRef, useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";

export type MapViewHandle = LeafletMap | null;

interface MapViewProps {
  /** 지도가 마운트된 뒤 호출 — 부모가 지도 인스턴스를 저장할 때 사용 */
  onReady?: (map: LeafletMap) => void;
  className?: string;
}

// Leaflet은 SSR 미지원 → "use client" + 부모에서 dynamic(ssr:false) 로 로드
// simplify: 마커/핀 렌더는 에이전트 B가 children props를 추가해 담당
const MapView = forwardRef<LeafletMap, MapViewProps>(function MapView(
  { onReady, className },
  ref
) {
  // 도쿄 기본 중심, 줌 12
  const center: [number, number] = [35.6762, 139.6503];

  return (
    <MapContainer
      center={center}
      zoom={12}
      ref={ref}
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {onReady && <MapReadyBridge onReady={onReady} />}
    </MapContainer>
  );
});

// MapContainer 안에서만 useMap() 호출 가능 → 자식 컴포넌트로 분리
// ref 대신 안정적인 콜백 방식으로 지도 인스턴스를 부모에 전달
function MapReadyBridge({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

export default MapView;
