import type { Pin } from "./types";

// 핀 하나를 구글 지도에서 열어 주는 주소를 만든다.
// 주소를 알면 이름+주소로 물어 정확히 그 가게가 뜨고, 모르면 좌표로 그 지점을 연다.
export function googleMapsUrl(pin: Pin): string {
  const q = pin.address
    ? `${pin.name} ${pin.address}`
    : `${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
