"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import type { Map as LeafletMap } from "leaflet";
import {
  CalendarDays,
  Link2,
  Map as MapIcon,
  MapPin,
  Plane,
  Plus,
  Search,
} from "lucide-react";
import { findCity, resolveCity, type LatLng } from "@/lib/cities";
import type { Itinerary, Pin, PinType, MapBounds } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";
import { loadPins, savePins } from "@/lib/pinStorage";
import {
  loadItinerary,
  saveItinerary,
  sanitizeItinerary,
  EMPTY_ITINERARY,
} from "@/lib/itineraryStorage";
import { getUserId } from "@/lib/user";
import {
  applyPinChanges,
  pushItinerary,
  pushPin,
  pushPinDelete,
  useRoomSync,
} from "@/lib/sync";
import PinModal from "@/components/PinModal";
import Sidebar, { type SidebarTab } from "@/components/Sidebar";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
      지도를 불러오는 중…
    </div>
  ),
});

// 기본으로 보여줄 방 목록. 예전 방(오사카·가오슝)은 정리했다.
const ROOMS = ["푸꾸옥"];
const OLD_ROOMS = ["오사카 5월", "가오슝 6월"];
const DEFAULT_ROOM = "푸꾸옥";

const DEFAULT_CENTER: LatLng = [10.2899, 103.984]; // 푸꾸옥
const DEFAULT_ZOOM = 11;

const EMPTY_PINS: Pin[] = [];

// 방마다 마지막으로 보던 지도 위치를 기억해 둔다.
interface SavedView {
  lat: number;
  lng: number;
  zoom: number;
}

const viewKey = (room: string) => `travel-view-${room || "기본"}`;

function loadView(room: string): SavedView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(viewKey(room));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedView>;
    if (
      typeof v.lat !== "number" ||
      typeof v.lng !== "number" ||
      typeof v.zoom !== "number"
    )
      return null;
    return v as SavedView;
  } catch {
    return null;
  }
}

function saveView(room: string, view: SavedView): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(viewKey(room), JSON.stringify(view));
  } catch {
    // 용량 초과 등은 무시
  }
}

// 방에 맞는 첫 지도 위치: 보던 위치 > 방 이름이 도시면 그 도시 > 푸꾸옥
function initialViewFor(room: string): { center: LatLng; zoom: number } {
  const saved = loadView(room);
  if (saved) return { center: [saved.lat, saved.lng], zoom: saved.zoom };
  const city = findCity(room);
  if (city) return { center: city, zoom: DEFAULT_ZOOM };
  return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
}

function readStoredRoom(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem("currentRoom") ?? "";
  // 예전 방에 있었으면 푸꾸옥으로 옮긴다.
  if (!stored || OLD_ROOMS.includes(stored)) return DEFAULT_ROOM;
  return stored;
}

// URL ?room=xxx 처리 — 초대 링크로 들어온 경우. 빈 값이면 저장된 방(없으면 푸꾸옥).
function resolveInitialRoom(): string {
  if (typeof window === "undefined") return "";
  const fromUrl = new URLSearchParams(window.location.search).get("room") ?? "";
  if (fromUrl && !OLD_ROOMS.includes(fromUrl)) return fromUrl;
  return readStoredRoom();
}

function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 랜덤 방 ID — 초대 링크용. 짧게.
function newRoomId(): string {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

// 브라우저에 저장된 값(방·핀·일정)은 서버가 알 수 없다. 서버가 그린 화면과 첫 화면을
// 똑같이 맞춰야 React가 화면을 이어받을 수 있으므로, 이어받기가 끝난 뒤에만 저장값을 보여준다.
const NOOP_SUBSCRIBE = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => true,
    () => false
  );
}

const DOCK_ITEMS = [
  { key: "map", icon: MapIcon, label: "지도" },
  { key: "pins", icon: MapPin, label: "핀" },
  { key: "itinerary", icon: CalendarDays, label: "일정" },
  { key: "info", icon: Plane, label: "기록" },
] as const;

export default function Home() {
  const hydrated = useHydrated();
  const mapRef = useRef<LeafletMap | null>(null);
  const roomRef = useRef<string>("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [room, setRoom] = useState<string>(() => resolveInitialRoom());
  const [notice, setNotice] = useState<string>("");

  const [pins, setPins] = useState<Pin[]>(() => loadPins(resolveInitialRoom()));
  const [itinerary, setItinerary] = useState<Itinerary>(() =>
    loadItinerary(resolveInitialRoom())
  );
  const [initialView] = useState(() => initialViewFor(resolveInitialRoom()));
  const [modalCoord, setModalCoord] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [aiLoading, setAILoading] = useState(false);
  const [copied, setCopied] = useState(false);
  // 하단 독 — 지도가 기본. 핀/일정/기록은 화면을 통째로 쓴다(1화면 1기능).
  const [tab, setTab] = useState<"map" | SidebarTab>("map");

  // 로그인 없이 브라우저를 구분하는 ID — 렌더에도 쓰이므로 state(첫 렌더에 한 번만 계산).
  const [userId] = useState<string>(() => getUserId());

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // 예전 방(오사카·가오슝) 저장물 청소 — 한 번만.
  useEffect(() => {
    for (const old of OLD_ROOMS) {
      window.localStorage.removeItem(`travel-pins-${old}`);
      window.localStorage.removeItem(`travel-itinerary-${old}`);
      window.localStorage.removeItem(viewKey(old));
    }
    if (room) window.localStorage.setItem("currentRoom", room);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 핀·일정 로컬 저장 — 서버 전송은 각 조작 핸들러에서 따로 한다.
  useEffect(() => {
    savePins(room, pins);
  }, [room, pins]);

  useEffect(() => {
    saveItinerary(room, itinerary);
  }, [room, itinerary]);

  // 3초 폴링 동기화 — 다른 사람의 변경분을 받아 합친다(내 변경의 메아리는 sync가 걸러줌).
  const { enabled: syncEnabled } = useRoomSync(room, {
    onPinChanges: (upserts, deletedIds) => {
      setPins((prev) => applyPinChanges(prev, upserts, deletedIds));
      if (deletedIds.length > 0) {
        setItinerary((prev) => ({
          ...prev,
          days: prev.days.map((d) => ({
            ...d,
            pinIds: d.pinIds.filter((pid) => !deletedIds.includes(pid)),
          })),
        }));
      }
    },
    onItinerary: (remote) => setItinerary(sanitizeItinerary(remote)),
  });

  const handleMapReady = useCallback((map: LeafletMap) => {
    mapRef.current = map;
    // 지도를 움직일 때마다 지금 방의 마지막 위치를 기억.
    map.on("moveend", () => {
      const c = map.getCenter();
      saveView(roomRef.current, { lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    });
  }, []);

  // 방에 맞춰 지도 이동: 보던 위치 > 방 이름 도시 > 핀들이 다 보이게
  const flyToRoom = useCallback((nextRoom: string, roomPins: Pin[]) => {
    const map = mapRef.current;
    if (!map) return;
    const saved = loadView(nextRoom);
    if (saved) {
      map.setView([saved.lat, saved.lng], saved.zoom);
      return;
    }
    const city = findCity(nextRoom);
    if (city) {
      map.setView(city, DEFAULT_ZOOM);
      return;
    }
    if (roomPins.length > 0) {
      const lats = roomPins.map((p) => p.lat);
      const lngs = roomPins.map((p) => p.lng);
      map.fitBounds(
        [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ],
        { padding: [40, 40], maxZoom: 14 }
      );
    }
  }, []);

  const handleRoomChange = (value: string) => {
    if (value === "__new__") {
      // 랜덤 방 생성 + URL 갱신(초대 링크용)
      const id = newRoomId();
      setRoom(id);
      setPins(loadPins(id));
      setItinerary(loadItinerary(id));
      window.history.replaceState(null, "", `?room=${id}`);
      localStorage.setItem("currentRoom", id);
      return;
    }
    if (!value) return;
    const nextPins = loadPins(value);
    setRoom(value);
    setPins(nextPins);
    setItinerary(loadItinerary(value));
    localStorage.setItem("currentRoom", value);
    window.history.replaceState(null, "", `?room=${encodeURIComponent(value)}`);
    flyToRoom(value, nextPins);
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setNotice("");
    try {
      const coords = await resolveCity(q);
      if (!coords) {
        setNotice(`"${q}"를 찾을 수 없어요`);
        return;
      }
      setTab("map");
      const map = mapRef.current;
      if (!map) return;
      map.setView(coords as LatLng, 12, { animate: true });
    } catch {
      setNotice("검색 중 문제가 생겼어요");
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setModalCoord({ lat, lng });
  }, []);

  // 독 가운데 + 단추 — 지금 보고 있는 지도 한가운데에 핀을 추가한다.
  const handleFab = useCallback(() => {
    setTab("map");
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    setModalCoord({ lat: c.lat, lng: c.lng });
  }, []);

  const handleAddPin = (data: {
    type: PinType;
    name: string;
    memo: string;
  }) => {
    if (!modalCoord) return;
    const cfg = PIN_TYPES[data.type];
    const newPin: Pin = {
      id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      lat: modalCoord.lat,
      lng: modalCoord.lng,
      type: data.type,
      name: data.name,
      memo: data.memo,
      emoji: cfg.emoji,
      isAI: false,
      createdAt: Date.now(),
      createdBy: userId || undefined,
    };
    setPins((prev) => [...prev, newPin]);
    void pushPin(room, newPin);
    setModalCoord(null);
  };

  const handlePinDelete = useCallback(
    (id: string) => {
      setPins((prev) => prev.filter((p) => p.id !== id));
      void pushPinDelete(room, id);
      // 일정에서도 해당 핀 제거
      setItinerary((prev) => ({
        ...prev,
        days: prev.days.map((d) => ({ ...d, pinIds: d.pinIds.filter((pid) => pid !== id) })),
      }));
    },
    [room]
  );

  const handlePinDragEnd = useCallback(
    (id: string, lat: number, lng: number) => {
      setPins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, lat, lng } : p))
      );
      const moved = pins.find((p) => p.id === id);
      if (moved) void pushPin(room, { ...moved, lat, lng });
    },
    [pins, room]
  );

  const handlePinClick = useCallback((pin: Pin) => {
    setTab("map");
    const map = mapRef.current;
    if (!map) return;
    map.setView([pin.lat, pin.lng], 16, { animate: true });
  }, []);

  const handleAISearch = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const bounds: MapBounds = {
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    };
    setAILoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/search-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bounds),
      });
      const data = (await res.json()) as {
        ok: boolean;
        pins?: Pin[];
        error?: string;
      };
      if (!data.ok || !data.pins) {
        setNotice(data.error ?? "맛집 검색에 실패했어요");
        return;
      }
      const fresh = data.pins.filter(
        (np) =>
          !pins.some(
            (ep) => distanceMeters(ep.lat, ep.lng, np.lat, np.lng) < 50
          )
      );
      if (fresh.length === 0) {
        setNotice("새로운 맛집을 찾지 못했어요");
        return;
      }
      setNotice(`맛집 ${fresh.length}개를 찾았어요`);
      setPins((prev) => [...prev, ...fresh]);
      for (const p of fresh) void pushPin(room, p);
    } catch {
      setNotice("맛집 검색 중 문제가 생겼어요");
    } finally {
      setAILoading(false);
    }
  }, [pins, room]);

  // 일정 변경 — 로컬 반영 + 서버 전송(내부에서 0.8초 모아 보냄)
  const handleItineraryChange = useCallback(
    (it: Itinerary) => {
      setItinerary(it);
      pushItinerary(room, it);
    },
    [room]
  );

  // 초대 링크 복사
  const handleCopyInvite = useCallback(async () => {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 폴백 — input 임시 생성
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setNotice("링크 복사에 실패했어요");
      }
      document.body.removeChild(input);
    }
  }, [room]);

  // 이어받기 전(서버가 그린 첫 화면)에는 저장값 대신 빈 상태를 그린다.
  const viewRoom = hydrated ? room : "";
  const viewUserId = hydrated ? userId : "";
  const viewPins = hydrated ? pins : EMPTY_PINS;
  const viewItinerary = hydrated ? itinerary : EMPTY_ITINERARY;

  return (
    <div className="app-shell">
      {/* 머리 — 손글씨 앱 이름 + 방 + 검색 */}
      <header className="shrink-0 px-4 pb-3 pt-3">
        <div className="mb-2.5 flex items-center gap-2">
          <h1 className="dw-display min-w-0 flex-1 truncate text-[1.5625rem] leading-tight text-[var(--text)]">
            여행 핀 지도
          </h1>
          <select
            value={viewRoom}
            onChange={(e) => handleRoomChange(e.target.value)}
            className="h-11 max-w-[8.5rem] shrink-0 rounded-[12px] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text)] shadow-[var(--shadow-1)] focus:outline-none"
            aria-label="여행 방 선택"
          >
            {!viewRoom && <option value="">방 선택</option>}
            {ROOMS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            {viewRoom && !ROOMS.includes(viewRoom) && (
              <option value={viewRoom}>{viewRoom}</option>
            )}
            <option value="__new__">+ 새 방 만들기</option>
          </select>
          <button
            type="button"
            onClick={handleCopyInvite}
            disabled={!viewRoom}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] shadow-[var(--shadow-1)] transition-colors disabled:opacity-40 ${
              copied
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface)] text-[var(--text-muted)]"
            }`}
            aria-label={copied ? "초대 링크 복사됨" : "초대 링크 복사"}
          >
            <Link2 size={19} strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              size={17}
              strokeWidth={2.2}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="어디로 갈까요?"
              className="dw-input dw-input--sm dw-input--icon"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            className="dw-btn-primary h-11 min-h-0 shrink-0 px-4 text-sm"
          >
            {searching ? "…" : "이동"}
          </button>
        </div>
      </header>

      {notice && (
        <div className="shrink-0 bg-[var(--accent-bg)] px-4 py-2 text-sm font-medium text-[var(--accent)]">
          {notice}
        </div>
      )}

      {!syncEnabled && (
        <div className="shrink-0 bg-[var(--surface-hover)] px-4 py-1.5 text-xs text-[var(--text-muted)]">
          아직 혼자만 사용 중 — 함께 편집하려면 서버 데이터베이스(Neon) 연결이 필요해요.
        </div>
      )}

      {/* 몸통 — 지도 위에 패널이 통째로 덮인다 */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <MapView
          onReady={handleMapReady}
          pins={viewPins}
          currentUserId={viewUserId}
          initialCenter={initialView.center}
          initialZoom={initialView.zoom}
          onPinDelete={handlePinDelete}
          onPinDragEnd={handlePinDragEnd}
          onMapClick={handleMapClick}
          className="h-full w-full"
        />

        {/* 지도 위 플로팅 — AI 맛집 */}
        <button
          type="button"
          onClick={handleAISearch}
          disabled={aiLoading}
          className="dw-btn-primary absolute bottom-4 left-1/2 z-[1000] -translate-x-1/2 rounded-full px-5 shadow-[var(--shadow-2)] disabled:opacity-60"
        >
          {aiLoading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Search size={16} strokeWidth={2.4} aria-hidden />
          )}
          AI 맛집 찾기
        </button>

        {tab !== "map" && (
          <div className="absolute inset-0 z-[1010] bg-[var(--bg)]">
            <Sidebar
              pins={viewPins}
              itinerary={viewItinerary}
              currentUserId={viewUserId}
              onPinClick={handlePinClick}
              onPinDelete={handlePinDelete}
              onItineraryChange={handleItineraryChange}
              tab={tab}
            />
          </div>
        )}
      </div>

      {/* 하단 독 — Doweek 문법: 유리판 + 가운데 추가 단추 */}
      <nav className="dock-nav" aria-label="화면 이동">
        <div className="dock-wrap">
          <button type="button" className="dock-fab" onClick={handleFab} aria-label="핀 추가">
            <span className="fab-glyph flex">
              <Plus size={22} strokeWidth={2.5} />
            </span>
          </button>
          <div className="dock-glass">
            {DOCK_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`dock-item${active ? " active" : ""}`}
                  onClick={() => setTab(item.key)}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={21} strokeWidth={active ? 2.5 : 1.5} />
                  <span className="dock-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {modalCoord && (
        <PinModal
          lat={modalCoord.lat}
          lng={modalCoord.lng}
          onAdd={handleAddPin}
          onClose={() => setModalCoord(null)}
        />
      )}
    </div>
  );
}
