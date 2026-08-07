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
import { resolveCity, type LatLng } from "@/lib/cities";
import type { Itinerary, Pin, PinType, MapBounds } from "@/lib/types";
import { PIN_TYPES } from "@/lib/pinTypes";
import { loadPins, savePins } from "@/lib/pinStorage";
import {
  loadItinerary,
  saveItinerary,
  EMPTY_ITINERARY,
} from "@/lib/itineraryStorage";
import { getUserId } from "@/lib/user";
import { isSupabaseReady } from "@/lib/supabase";
import {
  broadcastItinerary,
  broadcastPins,
  subscribeToRoom,
} from "@/lib/realtime";
import PinModal from "@/components/PinModal";
import Sidebar from "@/components/Sidebar";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
      지도를 불러오는 중…
    </div>
  ),
});

const ROOMS = ["새 방 만들기", "오사카 5월", "가오슝 6월"];

const EMPTY_PINS: Pin[] = [];

function readStoredRoom(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("currentRoom") ?? "";
}

// URL ?room=xxx 처리 — 초대 링크로 들어온 경우. 빈 값이면 기존 저장 방.
// 브라우저에서만 실행되므로 window.location으로 읽는다(Suspense 경계 불필요).
function resolveInitialRoom(): string {
  if (typeof window === "undefined") return "";
  const fromUrl = new URLSearchParams(window.location.search).get("room") ?? "";
  if (fromUrl) return fromUrl;
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

export default function Home() {
  const hydrated = useHydrated();
  const mapRef = useRef<LeafletMap | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [room, setRoom] = useState<string>(() => resolveInitialRoom());
  const [notice, setNotice] = useState<string>("");

  const [pins, setPins] = useState<Pin[]>(() => loadPins(resolveInitialRoom()));
  const [itinerary, setItinerary] = useState<Itinerary>(() =>
    loadItinerary(resolveInitialRoom())
  );
  const [modalCoord, setModalCoord] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [aiLoading, setAILoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // 로그인 없이 브라우저를 구분하는 ID — 렌더에도 쓰이므로 state(첫 렌더에 한 번만 계산).
  const [userId] = useState<string>(() => getUserId());
  const realtimeUnsub = useRef<(() => void) | null>(null);
  // 외부(다른 사용자)로부터 들어온 변경 표시 — broadcast echo 무한루프 방지용.
  const applyingRemote = useRef(false);

  // 핀 저장 — 로컬 + 브로드캐스트
  useEffect(() => {
    savePins(room, pins);
    if (!applyingRemote.current) broadcastPins(room, pins);
  }, [room, pins]);

  // 일정 저장 — 로컬 + 브로드캐스트
  useEffect(() => {
    saveItinerary(room, itinerary);
    if (!applyingRemote.current) broadcastItinerary(room, itinerary);
  }, [room, itinerary]);

  // 실시간 구독 — room 바뀔 때마다 재구독
  useEffect(() => {
    realtimeUnsub.current?.();
    if (!room || !isSupabaseReady()) {
      realtimeUnsub.current = null;
      return;
    }
    realtimeUnsub.current = subscribeToRoom(room, {
      onPins: (remote) => {
        applyingRemote.current = true;
        setPins(remote);
        savePins(room, remote);
        // 다음 틱에 플래그 해제 — 로컬 저장 effect가 원격 변경 저장도 broadcast 안 하도록.
        setTimeout(() => {
          applyingRemote.current = false;
        }, 0);
      },
      onItinerary: (remote) => {
        applyingRemote.current = true;
        setItinerary(remote);
        saveItinerary(room, remote);
        setTimeout(() => {
          applyingRemote.current = false;
        }, 0);
      },
    });
    return () => {
      realtimeUnsub.current?.();
      realtimeUnsub.current = null;
    };
  }, [room]);

  const handleMapReady = useCallback((map: LeafletMap) => {
    mapRef.current = map;
  }, []);

  const handleRoomChange = (value: string) => {
    if (value === "새 방 만들기") {
      // 랜덤 방 생성 + URL 갱신(초대 링크용)
      const id = newRoomId();
      setRoom(id);
      setPins(loadPins(id));
      setItinerary(loadItinerary(id));
      window.history.replaceState(null, "", `?room=${id}`);
      localStorage.setItem("currentRoom", id);
      return;
    }
    setRoom(value);
    setPins(loadPins(value));
    setItinerary(loadItinerary(value));
    if (value) {
      localStorage.setItem("currentRoom", value);
      window.history.replaceState(null, "", `?room=${encodeURIComponent(value)}`);
    }
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
    setModalCoord(null);
  };

  const handlePinDelete = useCallback((id: string) => {
    setPins((prev) => prev.filter((p) => p.id !== id));
    // 일정에서도 해당 핀 제거
    setItinerary((prev) => ({
      ...prev,
      days: prev.days.map((d) => ({ ...d, pinIds: d.pinIds.filter((pid) => pid !== id) })),
    }));
  }, []);

  const handlePinDragEnd = useCallback(
    (id: string, lat: number, lng: number) => {
      setPins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, lat, lng } : p))
      );
    },
    []
  );

  const handlePinClick = useCallback((pin: Pin) => {
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
      setPins((prev) => {
        const filtered = data.pins!.filter(
          (np) =>
            !prev.some(
              (ep) => distanceMeters(ep.lat, ep.lng, np.lat, np.lng) < 50
            )
        );
        if (filtered.length === 0) {
          setNotice("새로운 맛집을 찾지 못했어요");
          return prev;
        }
        setNotice(`맛집 ${filtered.length}개를 찾았어요 🍜`);
        return [...prev, ...filtered];
      });
    } catch {
      setNotice("맛집 검색 중 문제가 생겼어요");
    } finally {
      setAILoading(false);
    }
  }, []);

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
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      {/* 헤더 — 흰 배경, accent 텍스트, 아래 그림자 */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-sm md:h-16 md:flex-nowrap md:gap-4 md:px-4 md:py-0">
        <h1 className="whitespace-nowrap text-base font-bold tracking-tight text-[var(--accent)] md:text-lg">
          🗺️ 여행 핀 지도
        </h1>

        <div className="order-3 flex w-full min-w-0 items-center gap-2 md:order-none md:w-auto md:flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="도시 이름 (예: 오사카)"
            className="h-10 w-full min-w-0 max-w-sm rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            className="h-10 shrink-0 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {searching ? "찾는 중…" : "이동"}
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopyInvite}
          disabled={!viewRoom}
          className="ml-auto h-10 shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-40 md:ml-0"
          aria-label="초대 링크 복사"
        >
          🔗 <span className="hidden sm:inline">{copied ? "복사됨" : "초대 링크"}</span>
        </button>

        <select
          value={viewRoom}
          onChange={(e) => handleRoomChange(e.target.value)}
          className="h-10 min-w-0 max-w-[9rem] shrink rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none md:max-w-none md:shrink-0"
          aria-label="여행 방 선택"
        >
          <option value="">여행 방 선택</option>
          {ROOMS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          {/* URL/랜덤 방이 드롭다운 목록에 없으면 보여줌 */}
          {viewRoom && !ROOMS.includes(viewRoom) && (
            <option value={viewRoom}>{viewRoom}</option>
          )}
        </select>
      </header>

      {notice && (
        <div className="shrink-0 bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent-hover)]">
          {notice}
        </div>
      )}

      {/* Supabase 미설정 안내 — 작게 */}
      {!isSupabaseReady() && (
        <div className="shrink-0 bg-[var(--surface-hover)] px-4 py-1.5 text-xs text-[var(--text-muted)]">
          아직 혼자만 사용 중 — 초대 링크로 함께 편집하려면 Supabase 키 설정이 필요해요.
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="h-full w-full md:w-[70%]">
          <MapView
            onReady={handleMapReady}
            pins={viewPins}
            currentUserId={viewUserId}
            onPinDelete={handlePinDelete}
            onPinDragEnd={handlePinDragEnd}
            onMapClick={handleMapClick}
            className="h-full w-full"
          />
        </div>

        <div
          id="sidebar"
          className="hidden h-full w-[30%] border-l border-[var(--border)] md:block"
        >
          <Sidebar
            pins={viewPins}
            itinerary={viewItinerary}
            currentUserId={viewUserId}
            aiLoading={aiLoading}
            onAISearch={handleAISearch}
            onPinClick={handlePinClick}
            onPinDelete={handlePinDelete}
            onItineraryChange={setItinerary}
          />
        </div>
      </div>

      <MobileSidebarToggle
        pins={viewPins}
        itinerary={viewItinerary}
        currentUserId={viewUserId}
        aiLoading={aiLoading}
        onAISearch={handleAISearch}
        onPinClick={handlePinClick}
        onPinDelete={handlePinDelete}
        onItineraryChange={setItinerary}
      />

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

// 모바일: 하단 플로팅 버튼 → 풀스크린 시트
function MobileSidebarToggle({
  pins,
  itinerary,
  currentUserId,
  aiLoading,
  onAISearch,
  onPinClick,
  onPinDelete,
  onItineraryChange,
}: {
  pins: Pin[];
  itinerary: Itinerary;
  currentUserId: string;
  aiLoading: boolean;
  onAISearch: () => void;
  onPinClick: (pin: Pin) => void;
  onPinDelete: (id: string) => void;
  onItineraryChange: (it: Itinerary) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[1010] flex h-12 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-lg md:hidden"
        aria-label="핀 목록 열기"
      >
        📌 {pins.length}
      </button>

      {open && (
        <div className="fixed inset-0 z-[1020] flex flex-col bg-[var(--surface)] md:hidden">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
            <span className="font-semibold text-[var(--text)]">여행 계획</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <Sidebar
              pins={pins}
              itinerary={itinerary}
              currentUserId={currentUserId}
              aiLoading={aiLoading}
              onAISearch={() => {
                setOpen(false);
                onAISearch();
              }}
              onPinClick={(p) => {
                onPinClick(p);
                setOpen(false);
              }}
              onPinDelete={onPinDelete}
              onItineraryChange={onItineraryChange}
            />
          </div>
        </div>
      )}
    </>
  );
}