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
  Bot,
  CalendarDays,
  ChevronDown,
  List,
  Luggage,
  Map as MapIcon,
  MapPin,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  findCity,
  resolveCity,
  suggestPlaces,
  type LatLng,
  type PlaceSuggestion,
} from "@/lib/cities";
import type { Itinerary, Pin, PinType } from "@/lib/types";
import { PIN_TYPES, PIN_TYPE_LIST } from "@/lib/pinTypes";
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
  retryFailed,
  useRoomSync,
  useSaveStatus,
} from "@/lib/sync";
import AIPickSheet from "@/components/AIPickSheet";
import AssistantPanel, { type AssistantMsg } from "@/components/AssistantPanel";
import PinList from "@/components/PinList";
import PinModal from "@/components/PinModal";
import PreparePanel from "@/components/PreparePanel";
import ProjectSwitcher from "@/components/ProjectSwitcher";
import SchedulePanel from "@/components/SchedulePanel";

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

// 아래 메뉴 다섯 — 손으로 꽂는 지도, 꽂아 둔 곳을 줄줄이 보는 리스트, AI에게 시키는 비서,
// 떠나기 전에 채우는 준비, 현지에서 보는 일정. 다섯 칸을 다 쓰므로 + 단추는 칸 사이에
// 끼워 넣지 못하고, 막대 바로 위에 떠 있다(globals.css의 .dock-fab 설명 참고).
const DOCK_ITEMS = [
  { key: "map", icon: MapIcon, label: "지도" },
  { key: "list", icon: List, label: "리스트" },
  { key: "assistant", icon: Bot, label: "비서" },
  { key: "prepare", icon: Luggage, label: "준비" },
  { key: "schedule", icon: CalendarDays, label: "일정" },
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
  const [rooms] = useState<Room[]>(() =>
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
  // + 를 눌러 "자리 고르기"를 켠 상태 — 지도 가운데 십자를 보여 준다.
  const [picking, setPicking] = useState(false);
  // AI가 찾아온 후보들 — 고르는 시트가 열려 있는 동안만 들고 있는다.
  const [aiFound, setAIFound] = useState<Pin[] | null>(null);
  const [tab, setTab] = useState<Tab>("map");
  // 리스트 화면에서 어떤 종류만 볼지 — 접힌 목록(드롭다운)으로 고른다.
  const [listType, setListType] = useState<PinType | "all">("all");
  // 비서 채팅 — 여행(방)을 바꾸면 비운다(다른 도시 이야기가 섞이지 않게).
  const [chat, setChat] = useState<AssistantMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

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

  // 알림 한 줄은 4초 뒤 저절로 사라진다 — 계속 남아 지도를 밀어내지 않게.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

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

  // 보내기 실패했을 때 못 간 것만 다시 보낸다(전부 다시 보내면 친구 변경분을 덮어쓴다).
  const handleResend = useCallback(() => {
    void retryFailed();
  }, []);

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
      // 다른 여행으로 넘어가면 이전 검색·비서 대화 흔적은 지운다
      setSearchTarget(null);
      setSugOpen(false);
      setPicking(false);
      setChat([]);
      flyToRoom(value, nextPins);
    },
    [flyToRoom]
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

  // + 단추 — 바로 꽂지 않고 "자리 고르기"를 켠다. 지도를 움직여 가운데 십자에
  // 원하는 곳을 맞춘 다음 확인을 눌러야 핀이 꽂힌다(지도를 눌러선 꽂히지 않는다).
  const handleFab = useCallback(() => {
    setTab("map");
    setPicking(true);
  }, []);

  const confirmPick = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    setPicking(false);
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
      // 일정에서도 빼고, 그 사실을 서버에도 알린다(안 그러면 서버 일정에 유령 자리가 남는다).
      const wasPlanned = itinerary.days.some((d) => d.pinIds.includes(id));
      const nextItinerary = {
        ...itinerary,
        days: itinerary.days.map((d) => ({
          ...d,
          pinIds: d.pinIds.filter((pid) => pid !== id),
        })),
      };
      setItinerary(nextItinerary);
      if (wasPlanned) pushItinerary(room, nextItinerary);
    },
    [room, itinerary]
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

  // 고른 후보만 지도에 꽂는다.
  const handleAIAdd = useCallback(
    (chosen: Pin[]) => {
      setAIFound(null);
      if (chosen.length === 0) return;
      setPins((prev) => [...prev, ...chosen]);
      for (const p of chosen) void pushPin(room, p);
      setNotice(`${chosen.length}곳을 꽂았어요`);
      // 꽂은 결과가 바로 보이게 지도로 넘어간다
      setTab("map");
    },
    [room]
  );

  // 비서에게 한 마디 보내기 — 서버 AI가 조사해서 답 + 핀 후보를 돌려준다.
  const handleAssistantSend = useCallback(
    async (text: string) => {
      const history: AssistantMsg[] = [...chat, { role: "user", text }];
      setChat(history);
      setChatLoading(true);
      try {
        const c = mapRef.current?.getCenter();
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // 실패 안내문은 대화 맥락에서 뺀다
            messages: history
              .filter((m) => !m.isError)
              .map((m) => ({ role: m.role, text: m.text })),
            context: {
              room: rooms.find((r) => r.id === room)?.label,
              center: c ? { lat: c.lat, lng: c.lng } : undefined,
              pinNames: pins.map((p) => p.name).slice(0, 40),
            },
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          reply?: string;
          pins?: Pin[];
          sources?: { title: string; url: string; blogger?: string }[];
          error?: string;
        };
        if (!data.ok) {
          setChat((cur) => [
            ...cur,
            { role: "assistant", text: data.error ?? "문제가 생겼어요.", isError: true },
          ]);
          return;
        }
        // 이미 꽂힌 핀과 50m 안쪽으로 겹치는 후보는 뺀다
        const fresh = (data.pins ?? []).filter(
          (np) =>
            !pins.some((ep) => distanceMeters(ep.lat, ep.lng, np.lat, np.lng) < 50)
        );
        setChat((cur) => [
          ...cur,
          {
            role: "assistant",
            text: data.reply ?? "",
            pins: fresh.length > 0 ? fresh : undefined,
            sources: data.sources && data.sources.length > 0 ? data.sources : undefined,
          },
        ]);
      } catch {
        setChat((cur) => [
          ...cur,
          {
            role: "assistant",
            text: "서버와 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
            isError: true,
          },
        ]);
      } finally {
        setChatLoading(false);
      }
    },
    [chat, room, rooms, pins]
  );

  // 일정 변경 — 로컬 반영 + 서버 전송(내부에서 0.8초 모아 보냄)
  const handleItineraryChange = useCallback(
    (it: Itinerary) => {
      setItinerary(it);
      pushItinerary(room, it);
    },
    [room]
  );

  // 이어받기 전(서버가 그린 첫 화면)에는 저장값 대신 빈 상태를 그린다.
  const viewRoom = hydrated ? room : "";
  const viewRooms = hydrated ? rooms : INITIAL_ROOMS;
  const viewUserId = hydrated ? userId : "";
  const viewPins = hydrated ? pins : EMPTY_PINS;
  const viewItinerary = hydrated ? itinerary : EMPTY_ITINERARY;
  // 리스트 화면에서 고른 종류만 남긴 핀 — 거르기는 여기(부모)에서 끝낸다.
  const listPins =
    listType === "all" ? viewPins : viewPins.filter((p) => p.type === listType);
  const listing = tab === "list";
  // 지도가 화면을 꽉 채우고 있는 상태 — 이때만 위 알약 줄과 아래 메뉴의 바탕을 비워
  // 지도가 그 뒤까지 그대로 보이게 한다.
  const mapFull = tab === "map";

  return (
    <div className="app-shell">
      {/* 머리 — 여행 고르는 알약 한 줄 + 장소 검색. 지도 위에 떠 있다. */}
      <header
        className={`relative z-[1050] shrink-0 px-4 pb-2 pt-2${
          mapFull ? "" : " bg-[var(--bg)]"
        }`}
      >
        <div className="flex items-center gap-2">
          <ProjectSwitcher
            rooms={viewRooms}
            currentId={viewRoom || DEFAULT_ROOM.id}
            onSelect={switchRoom}
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
                        <span className="flex w-5 shrink-0 items-center justify-center" aria-hidden>
                          {(() => {
                            const c = PIN_TYPES[p.type];
                            return <c.Icon size={16} color={c.color} />;
                          })()}
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
        <div className="relative z-[1030] shrink-0 bg-[var(--accent-bg)] px-4 py-2 text-sm font-medium text-[var(--accent)]">
          {notice}
        </div>
      )}

      {/* 저장 알림 — 잘 갔는지 눈으로 확인. 실패는 누를 때까지 사라지지 않는다. */}
      {syncEnabled && saveStatus !== "idle" && (
        <div
          className={`relative z-[1030] flex shrink-0 items-center gap-2 px-4 py-1.5 text-xs font-semibold ${
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

      {/* 자리 고르기 — 가운데 십자. 지도 한가운데가 곧 화면 한가운데라야 십자가 가리키는
          곳에 핀이 꽂힌다. 손가락 입력은 그대로 지도로 통과시킨다. */}
      {mapFull && picking && (
        <div
          className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center"
          aria-hidden
        >
          <span className="map-crosshair" />
        </div>
      )}

      {/* 지도 — 위 알약 줄과 아래 메뉴 뒤까지 화면 전체에 깔린다(그림은 맨 뒤, 순서는 머리 다음:
          탭키를 누르면 위 단추들을 먼저 지나고 그다음 지도 핀에 닿는다). 탭을 바꿔도 그대로
          남아 있다(다시 그리면 느리다). 다만 덮여 있는 동안에는 보이지도 않는 핀 수십 개가
          키보드 순서에 끼어 있어, inert로 덮인 동안만 통째로 건너뛰게 한다. */}
      <div className="map-layer" inert={tab !== "map"}>
        <MapView
          onReady={handleMapReady}
          pins={viewPins}
          currentUserId={viewUserId}
          initialCenter={initialView.center}
          initialZoom={initialView.zoom}
          onPinDelete={handlePinDelete}
          onPinDragEnd={handlePinDragEnd}
          searchTarget={searchTarget}
          onSearchTargetAdd={handleSearchTargetAdd}
          onSearchTargetClose={() => setSearchTarget(null)}
          className="h-full w-full"
        />
      </div>

      {/* 몸통 — 지도 위에 여행 화면이 통째로 덮인다. 아무것도 덮이지 않은 자리는 손가락
          입력을 뒤 지도로 흘려보낸다(pointer-events-none). 덮개마다 다시 켜 준다. */}
      <div className="pointer-events-none relative min-h-0 flex-1 overflow-hidden">
        {/* 지도 위 떠 있는 막대 — 자리를 고르는 중에만. 핀 추가 단추는 아래 메뉴 가운데로 옮겼다. */}
        {tab === "map" && picking && (
          <div className="pointer-events-auto absolute inset-x-4 bottom-4 z-[1001] flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="h-12 shrink-0 rounded-[14px] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--text-muted)] shadow-[var(--shadow-2)]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirmPick}
              className="h-12 min-w-0 flex-1 rounded-[14px] bg-[var(--accent)] text-sm font-bold text-white shadow-[var(--shadow-2)] active:scale-[0.98]"
            >
              여기에 핀 꽂기
            </button>
          </div>
        )}

        {/* 리스트 — 지도를 덮는 판. 종류는 접힌 목록에서 하나 골라 걸러 보고,
            지도 단추를 누르면 그 자리로 지도가 넘어간다. */}
        {listing && (
          <div className="pointer-events-auto absolute inset-0 z-[1005] flex flex-col bg-[var(--bg)] pt-2">
            <div className="shrink-0 px-4 pb-2">
              <div className="relative inline-flex items-center">
                <select
                  value={listType}
                  onChange={(e) =>
                    setListType(e.target.value as PinType | "all")
                  }
                  className="list-filter"
                  aria-label="볼 종류 고르기"
                >
                  <option value="all">전체 ({viewPins.length})</option>
                  {PIN_TYPE_LIST.map((cfg) => (
                    <option key={cfg.type} value={cfg.type}>
                      {cfg.emoji} {cfg.label} (
                      {viewPins.filter((p) => p.type === cfg.type).length})
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  strokeWidth={2.2}
                  className="pointer-events-none absolute right-3 text-[var(--text-muted)]"
                  aria-hidden
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {listPins.length === 0 && listType !== "all" ? (
                <p className="px-1 py-2 text-sm text-[var(--text-muted)]">
                  이 종류로 꽂아 둔 곳이 없어요
                </p>
              ) : (
                <PinList
                  pins={listPins}
                  currentUserId={viewUserId}
                  onShowOnMap={handleShowOnMap}
                  onPinDelete={handlePinDelete}
                />
              )}
            </div>
          </div>
        )}

        {/* 비서 — AI에게 말로 시키는 화면. 대화는 페이지가 들고 있어 탭을 오가도 남는다. */}
        {tab === "assistant" && (
          <div className="pointer-events-auto absolute inset-0 z-[1010] bg-[var(--bg)]">
            <AssistantPanel
              messages={chat}
              loading={chatLoading}
              onSend={handleAssistantSend}
              onPickPins={(found) => setAIFound(found)}
            />
          </div>
        )}

        {/* 준비 — 떠나기 전에 채우는 칸(항공·날짜·숙소·집합·짐·장보기·안건) */}
        {tab === "prepare" && (
          <div className="pointer-events-auto absolute inset-0 z-[1010] bg-[var(--bg)]">
            <PreparePanel
              pins={viewPins}
              itinerary={viewItinerary}
              onShowOnMap={handleShowOnMap}
              onItineraryChange={handleItineraryChange}
            />
          </div>
        )}

        {/* 일정 — 현지에서 꺼내 보는 화면(고치는 칸 없음) */}
        {tab === "schedule" && (
          <div className="pointer-events-auto absolute inset-0 z-[1010] bg-[var(--bg)]">
            <SchedulePanel
              pins={viewPins}
              itinerary={viewItinerary}
              onShowOnMap={handleShowOnMap}
            />
          </div>
        )}
      </div>

      {/* 하단 독 — Doweek 문법: 유리판 네 칸 + 가운데로 튀어나온 파란 + 단추(FAB).
          지도를 볼 때는 바탕을 비워 유리판 옆·뒤로 지도가 그대로 보이게 한다. */}
      <nav
        className={`dock-nav${mapFull ? " dock-nav--float" : ""}`}
        aria-label="화면 이동"
      >
        <div className="dock-wrap">
          <div className="dock-glass dock-glass--5">
            {DOCK_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`dock-item${active ? " active" : ""}`}
                  onClick={() => {
                    // 다른 화면으로 넘어가면 고르던 자리는 접는다
                    if (item.key !== "map") setPicking(false);
                    setTab(item.key);
                  }}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={21} strokeWidth={active ? 2.5 : 1.5} />
                  <span className="dock-label">{item.label}</span>
                </button>
              );
            })}
          </div>
          {/* 지도를 볼 때만 보여 준다 — 이 단추는 메뉴 막대 위에 떠 있어서, 다른 화면에서는
              적는 칸(준비 화면의 날짜 칸 같은 것)을 가려 버린다. 자리를 고르는 중에도 숨긴다
              (지도 위 확인/취소 막대가 같은 자리를 쓴다). */}
          <button
            type="button"
            onClick={handleFab}
            aria-label="핀 추가"
            className={`dock-fab${tab !== "map" || picking ? " dock-fab--hidden" : ""}`}
          >
            <Plus size={22} strokeWidth={2.5} aria-hidden />
          </button>
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
