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
  Map as MapIcon,
  MapPin,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  findCity,
  resolveCity,
  suggestPlaces,
  type LatLng,
  type PlaceSuggestion,
} from "@/lib/cities";
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
  addRoom,
  DEFAULT_ROOM,
  loadRooms,
  OLD_ROOMS,
  saveRooms,
  type Room,
} from "@/lib/rooms";
import {
  applyPinChanges,
  pushItinerary,
  pushPin,
  pushPinDelete,
  resendAll,
  useRoomSync,
  useSaveStatus,
} from "@/lib/sync";
import AIPickSheet from "@/components/AIPickSheet";
import PinModal from "@/components/PinModal";
import ProjectSwitcher from "@/components/ProjectSwitcher";
import TripPanel from "@/components/TripPanel";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
      지도를 불러오는 중…
    </div>
  ),
});

const DEFAULT_CENTER: LatLng = [10.2899, 103.984]; // 푸꾸옥
const DEFAULT_ZOOM = 11;

const EMPTY_PINS: Pin[] = [];
const INITIAL_ROOMS: Room[] = [DEFAULT_ROOM];

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
  // 예전 방에 있었으면 기본 여행으로 옮긴다.
  if (!stored || OLD_ROOMS.includes(stored)) return DEFAULT_ROOM.id;
  return stored;
}

// URL ?room=xxx 처리 — 초대 링크로 들어온 경우. 빈 값이면 저장된 방(없으면 기본 여행).
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

// 화면은 둘뿐 — 한눈에 보는 지도, 그리고 계획을 전부 모아 둔 여행 화면.
const DOCK_ITEMS = [
  { key: "map", icon: MapIcon, label: "지도" },
  { key: "trip", icon: NotebookPen, label: "여행" },
] as const;

type Tab = (typeof DOCK_ITEMS)[number]["key"];

export default function Home() {
  const hydrated = useHydrated();
  const mapRef = useRef<LeafletMap | null>(null);
  const roomRef = useRef<string>("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  // 글자를 치는 동안 아래에 떠 있는 후보 목록(자동완성)
  const [sugs, setSugs] = useState<PlaceSuggestion[]>([]);
  const [sugOpen, setSugOpen] = useState(false);
  const [sugIdx, setSugIdx] = useState(-1);
  // 검색으로 찾은 자리 — 지도에 파란 점으로 표시해 두는 임시 표식
  const [searchTarget, setSearchTarget] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  const sugAbortRef = useRef<AbortController | null>(null);
  // 후보를 골라서 입력칸 글자를 바꿀 땐 다시 검색하지 않게 하는 표시
  const skipSuggestRef = useRef(false);
  const [room, setRoom] = useState<string>(() => resolveInitialRoom());
  // 초대 링크로 처음 들어온 여행도 목록에 넣어 둬야 나중에 다시 찾아올 수 있다.
  const [rooms, setRooms] = useState<Room[]>(() =>
    addRoom(loadRooms(), resolveInitialRoom())
  );
  const [notice, setNotice] = useState<string>("");

  const [pins, setPins] = useState<Pin[]>(() => loadPins(resolveInitialRoom()));
  const [itinerary, setItinerary] = useState<Itinerary>(() =>
    loadItinerary(resolveInitialRoom())
  );
  const [initialView] = useState(() => initialViewFor(resolveInitialRoom()));
  const [modalCoord, setModalCoord] = useState<{
    lat: number;
    lng: number;
    name?: string;
  } | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  // AI가 찾아온 후보들 — 고르는 시트가 열려 있는 동안만 들고 있는다.
  const [aiFound, setAIFound] = useState<Pin[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("map");

  // 로그인 없이 브라우저를 구분하는 ID — 렌더에도 쓰이므로 state(첫 렌더에 한 번만 계산).
  const [userId] = useState<string>(() => getUserId());

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // 예전 방(오사카·가오슝) 저장물 청소 + 여행 목록 불러오기 — 한 번만.
  useEffect(() => {
    for (const old of OLD_ROOMS) {
      window.localStorage.removeItem(`travel-pins-${old}`);
      window.localStorage.removeItem(`travel-itinerary-${old}`);
      window.localStorage.removeItem(viewKey(old));
    }
    if (room) window.localStorage.setItem("currentRoom", room);
    saveRooms(rooms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // 글자를 칠 때마다(0.3초 숨 고르고) 장소 사전에 물어봐 후보 목록을 띄운다.
  // 지금 보고 있는 지도 근처를 먼저 보여주므로, 같은 이름이 여럿이어도 가까운 곳이 위로 온다.
  useEffect(() => {
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2) return; // 목록 비우기는 입력칸 onChange에서 처리
    const timer = setTimeout(async () => {
      sugAbortRef.current?.abort();
      const ac = new AbortController();
      sugAbortRef.current = ac;
      const c = mapRef.current?.getCenter();
      try {
        const list = await suggestPlaces(
          q,
          c ? [c.lat, c.lng] : undefined,
          ac.signal
        );
        if (ac.signal.aborted) return;
        setSugs(list);
        setSugOpen(true);
        setSugIdx(-1);
      } catch {
        // 도중에 취소됐거나 네트워크 문제 — 조용히 넘어간다(엔터 검색이 예비로 있음)
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

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

  // 서버로 잘 보내지고 있는지 — 머리 아래 한 줄로 보여준다.
  const saveStatus = useSaveStatus();

  // 보내기 실패했을 때 이 방의 핀과 일정을 통째로 다시 보낸다.
  const handleResend = useCallback(() => {
    void resendAll(room, pins, itinerary);
  }, [room, pins, itinerary]);

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

  const switchRoom = useCallback(
    (value: string) => {
      if (!value) return;
      const nextPins = loadPins(value);
      setRoom(value);
      setPins(nextPins);
      setItinerary(loadItinerary(value));
      localStorage.setItem("currentRoom", value);
      window.history.replaceState(null, "", `?room=${encodeURIComponent(value)}`);
      // 다른 여행으로 넘어가면 이전 검색 흔적은 지운다
      setSearchTarget(null);
      setSugOpen(false);
      flyToRoom(value, nextPins);
    },
    [flyToRoom]
  );

  // 새 여행 만들기 — 랜덤 ID + 사용자가 붙인 이름으로 목록에 남긴다.
  const handleCreateRoom = useCallback(
    (label: string) => {
      const id = newRoomId();
      setRooms((cur) => {
        const next = addRoom(cur, id, label);
        saveRooms(next);
        return next;
      });
      switchRoom(id);
      setTab("map");
    },
    [switchRoom]
  );

  // 후보 목록 닫기 — 목록과 고른 자리 표시를 함께 정리
  const closeSuggestions = useCallback(() => {
    setSugOpen(false);
    setSugIdx(-1);
  }, []);

  // 후보(장소)를 골랐을 때 — 지도에 파란 점을 찍고 그리로 날아간다.
  const goToPlace = useCallback(
    (s: PlaceSuggestion) => {
      skipSuggestRef.current = true;
      setQuery(s.name);
      closeSuggestions();
      setNotice("");
      setTab("map");
      setSearchTarget({ lat: s.lat, lng: s.lng, name: s.name });
      const map = mapRef.current;
      if (!map) return;
      // 도시처럼 넓은 곳은 영역 전체가 보이게, 가게는 가까이 확대해서 보여준다.
      if (s.bounds) map.fitBounds(s.bounds, { maxZoom: 17, animate: true });
      else map.setView([s.lat, s.lng], s.zoom, { animate: true });
    },
    [closeSuggestions]
  );

  // 후보(내 핀)를 골랐을 때 — 꽂아 둔 핀 자리로 이동.
  const goToMyPin = useCallback(
    (p: Pin) => {
      skipSuggestRef.current = true;
      setQuery(p.name);
      closeSuggestions();
      setTab("map");
      const map = mapRef.current;
      if (map) map.setView([p.lat, p.lng], 16, { animate: true });
    },
    [closeSuggestions]
  );

  // 엔터·이동 단추 — 후보가 아직 없을 때의 예비 검색(도시 표 → 주소 사전 순서)
  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setNotice("");
    closeSuggestions();
    try {
      const coords = await resolveCity(q);
      if (!coords) {
        setNotice(`"${q}"를 찾을 수 없어요 — 영어 이름으로도 시도해 보세요`);
        return;
      }
      setTab("map");
      setSearchTarget({ lat: coords[0], lng: coords[1], name: q });
      const map = mapRef.current;
      if (!map) return;
      map.setView(coords as LatLng, 12, { animate: true });
    } catch {
      setNotice("검색 중 문제가 생겼어요");
    } finally {
      setSearching(false);
    }
  };

  // 검색어와 이름이 겹치는 내 핀 — 구글맵의 "내 저장 장소"처럼 후보 맨 위에 보여준다.
  const pinQuery = query.trim().toLowerCase();
  const pinMatches =
    sugOpen && pinQuery
      ? pins.filter((p) => p.name.toLowerCase().includes(pinQuery)).slice(0, 3)
      : [];
  const sugCount = pinMatches.length + sugs.length;

  const selectSuggestion = (idx: number) => {
    if (idx < 0 || idx >= sugCount) return;
    if (idx < pinMatches.length) goToMyPin(pinMatches[idx]);
    else goToPlace(sugs[idx - pinMatches.length]);
  };

  // 위·아래 화살표로 후보를 고르고, 엔터로 확정하고, ESC로 닫는다 — 구글맵과 같은 손놀림.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && sugCount > 0) {
      e.preventDefault();
      setSugOpen(true);
      setSugIdx((i) => (i + 1) % sugCount);
    } else if (e.key === "ArrowUp" && sugCount > 0) {
      e.preventDefault();
      setSugIdx((i) => (i - 1 + sugCount) % sugCount);
    } else if (e.key === "Enter") {
      if (sugOpen && sugCount > 0) selectSuggestion(sugIdx >= 0 ? sugIdx : 0);
      else void handleSearch();
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  };

  // 검색으로 찾은 자리를 핀으로 저장 — 이름을 미리 채워 준다.
  const handleSearchTargetAdd = () => {
    if (!searchTarget) return;
    setModalCoord({
      lat: searchTarget.lat,
      lng: searchTarget.lng,
      name: searchTarget.name,
    });
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
    // 검색으로 찾은 자리에 핀을 꽂았으면 임시 표식은 치운다
    setSearchTarget(null);
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

  // 목록에서 지도 단추를 눌렀을 때만 지도로 넘어간다(이름만 눌러선 안 튕김).
  const handleShowOnMap = useCallback((pin: Pin) => {
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
      // 바로 꽂지 않고 먼저 보여준다 — 고른 것만 지도에 들어간다.
      setAIFound(fresh);
    } catch {
      setNotice("맛집 검색 중 문제가 생겼어요");
    } finally {
      setAILoading(false);
    }
  }, [pins]);

  // 고른 후보만 지도에 꽂는다.
  const handleAIAdd = useCallback(
    (chosen: Pin[]) => {
      setAIFound(null);
      if (chosen.length === 0) return;
      setPins((prev) => [...prev, ...chosen]);
      for (const p of chosen) void pushPin(room, p);
      setNotice(`${chosen.length}곳을 꽂았어요`);
    },
    [room]
  );

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
      setNotice("초대 링크를 복사했어요 — 친구에게 보내 주세요");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("링크 복사에 실패했어요");
    }
  }, [room]);

  // 이어받기 전(서버가 그린 첫 화면)에는 저장값 대신 빈 상태를 그린다.
  const viewRoom = hydrated ? room : "";
  const viewRooms = hydrated ? rooms : INITIAL_ROOMS;
  const viewUserId = hydrated ? userId : "";
  const viewPins = hydrated ? pins : EMPTY_PINS;
  const viewItinerary = hydrated ? itinerary : EMPTY_ITINERARY;

  return (
    <div className="app-shell">
      {/* 머리 — 여행 고르는 알약 한 줄. 남는 세로는 전부 지도에 준다. */}
      <header className="relative z-[1050] shrink-0 px-4 pb-2 pt-2">
        <div className="flex items-center gap-2">
          <ProjectSwitcher
            rooms={viewRooms}
            currentId={viewRoom || DEFAULT_ROOM.id}
            onSelect={switchRoom}
            onCreate={handleCreateRoom}
            onCopyInvite={handleCopyInvite}
            canInvite={syncEnabled}
            copied={copied}
          />
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] shadow-[var(--shadow-1)] transition-colors ${
              searchOpen
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface)] text-[var(--text-muted)]"
            }`}
            aria-label={searchOpen ? "장소 검색 닫기" : "장소 검색 열기"}
            aria-expanded={searchOpen}
          >
            {searchOpen ? (
              <X size={19} strokeWidth={2.2} />
            ) : (
              <Search size={19} strokeWidth={2.2} />
            )}
          </button>
        </div>

        {searchOpen && (
          <div className="mt-2 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                size={17}
                strokeWidth={2.2}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuery(v);
                  // 두 글자가 안 되면 후보 목록을 접는다
                  if (v.trim().length < 2) {
                    setSugs([]);
                    setSugOpen(false);
                    setSugIdx(-1);
                  }
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (sugs.length > 0) setSugOpen(true);
                }}
                onBlur={closeSuggestions}
                placeholder="어디로 갈까요?"
                className="dw-input dw-input--sm dw-input--icon"
                role="combobox"
                aria-controls="place-suggestions"
                aria-expanded={sugOpen && sugCount > 0}
                aria-autocomplete="list"
              />

              {/* 후보 목록 — 글자를 치면 바로 아래에 뜬다. 내 핀이 먼저, 그다음 장소. */}
              {sugOpen && sugCount > 0 && (
                <ul
                  id="place-suggestions"
                  role="listbox"
                  aria-label="장소 후보"
                  className="absolute left-0 right-0 top-full z-[1200] mt-2 max-h-72 overflow-y-auto rounded-[16px] bg-[var(--surface)] py-1.5 shadow-[var(--shadow-2)]"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {pinMatches.map((p, i) => (
                    <li key={p.id} role="option" aria-selected={sugIdx === i}>
                      <button
                        type="button"
                        onClick={() => goToMyPin(p)}
                        className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left ${
                          sugIdx === i ? "bg-[var(--surface-hover)]" : ""
                        }`}
                      >
                        <span className="w-5 shrink-0 text-center text-base leading-none" aria-hidden>
                          {p.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[var(--text)]">
                            {p.name}
                          </span>
                          <span className="block truncate text-xs text-[var(--text-muted)]">
                            내가 꽂은 핀
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {sugs.map((s, i) => {
                    const idx = pinMatches.length + i;
                    return (
                      <li
                        key={`${s.name}-${s.lat}-${s.lng}`}
                        role="option"
                        aria-selected={sugIdx === idx}
                      >
                        <button
                          type="button"
                          onClick={() => goToPlace(s)}
                          className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left ${
                            sugIdx === idx ? "bg-[var(--surface-hover)]" : ""
                          }`}
                        >
                          <MapPin
                            size={17}
                            strokeWidth={2}
                            className="w-5 shrink-0 text-[var(--text-faint)]"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[var(--text)]">
                              {s.name}
                            </span>
                            {s.address && (
                              <span className="block truncate text-xs text-[var(--text-muted)]">
                                {s.address}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (sugOpen && sugCount > 0) selectSuggestion(sugIdx >= 0 ? sugIdx : 0);
                else void handleSearch();
              }}
              disabled={searching}
              className="dw-btn-primary h-11 min-h-0 shrink-0 px-4 text-sm"
            >
              {searching ? "…" : "이동"}
            </button>
          </div>
        )}
      </header>

      {notice && (
        <div className="shrink-0 bg-[var(--accent-bg)] px-4 py-2 text-sm font-medium text-[var(--accent)]">
          {notice}
        </div>
      )}

      {!syncEnabled && (
        <div className="shrink-0 bg-[var(--surface-hover)] px-4 py-1.5 text-xs text-[var(--text-muted)]">
          지금은 이 기기에만 저장돼요 — 친구와 같이 보려면 서버 연결이 필요해요.
        </div>
      )}

      {/* 저장 알림 — 잘 갔는지 눈으로 확인. 실패는 누를 때까지 사라지지 않는다. */}
      {syncEnabled && saveStatus !== "idle" && (
        <div
          className={`flex shrink-0 items-center gap-2 px-4 py-1.5 text-xs font-semibold ${
            saveStatus === "failed"
              ? "bg-[var(--danger)] text-white"
              : "bg-[var(--surface-hover)] text-[var(--text-muted)]"
          }`}
          role="status"
        >
          {saveStatus === "saving" && <span>저장 중…</span>}
          {saveStatus === "saved" && <span>저장됐어요</span>}
          {saveStatus === "failed" && (
            <>
              <span className="min-w-0 flex-1">
                친구에게 보내지 못했어요 — 이 기기에는 남아 있어요
              </span>
              <button
                type="button"
                onClick={handleResend}
                className="shrink-0 rounded-full bg-white/20 px-3 py-1 font-bold"
              >
                다시 보내기
              </button>
            </>
          )}
        </div>
      )}

      {/* 몸통 — 지도 위에 여행 화면이 통째로 덮인다 */}
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
          searchTarget={searchTarget}
          onSearchTargetAdd={handleSearchTargetAdd}
          onSearchTargetClose={() => setSearchTarget(null)}
          className="h-full w-full"
        />

        {/* 첫 안내 — 핀이 하나도 없을 때만. 검색 결과를 보는 중엔 가리지 않게 숨긴다. */}
        {tab === "map" && viewPins.length === 0 && !searchTarget && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 z-[999] -translate-y-1/2 rounded-[16px] bg-[var(--surface)] px-5 py-4 text-center shadow-[var(--shadow-2)]">
            <p className="dw-display text-[1.25rem] text-[var(--text)]">
              가고 싶은 곳을 눌러 보세요
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              지도를 누르면 그 자리에 핀이 꽂혀요
            </p>
          </div>
        )}

        {/* 지도 위 떠 있는 단추 — 가운데 + 단추와 겹치지 않게 왼쪽 아래로 뺐다. */}
        {tab === "map" && (
          <button
            type="button"
            onClick={handleAISearch}
            disabled={aiLoading}
            className="dw-btn-primary absolute bottom-4 left-4 z-[1000] h-11 min-h-0 rounded-full px-4 text-sm shadow-[var(--shadow-2)] disabled:opacity-60"
          >
            {aiLoading ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Sparkles size={16} strokeWidth={2.4} aria-hidden />
            )}
            AI 맛집
          </button>
        )}

        {tab === "trip" && (
          <div className="absolute inset-0 z-[1010] bg-[var(--bg)]">
            <TripPanel
              pins={viewPins}
              itinerary={viewItinerary}
              currentUserId={viewUserId}
              onShowOnMap={handleShowOnMap}
              onPinDelete={handlePinDelete}
              onItineraryChange={handleItineraryChange}
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
          <div className="dock-glass dock-glass--2">
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
          initialName={modalCoord.name}
          onAdd={handleAddPin}
          onClose={() => setModalCoord(null)}
        />
      )}

      {aiFound && (
        <AIPickSheet
          found={aiFound}
          onAdd={handleAIAdd}
          onClose={() => setAIFound(null)}
        />
      )}
    </div>
  );
}
