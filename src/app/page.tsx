"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Map as LeafletMap } from "leaflet";
import { resolveCity, type LatLng } from "@/lib/cities";

// Leaflet은 SSR 미지원 → dynamic import + ssr:false
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
      지도를 불러오는 중…
    </div>
  ),
});

// 임시 여행 방 목록 — 기능은 나중에
const ROOMS = ["새 방 만들기", "오사카 5월", "가오슝 6월"];

export default function Home() {
  const mapRef = useRef<LeafletMap | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [room, setRoom] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

  // 지도 인스턴스 저장 (onReady 콜백)
  const handleMapReady = useCallback((map: LeafletMap) => {
    mapRef.current = map;
  }, []);

  // localStorage에서 마지막 선택 방 복원
  useEffect(() => {
    const saved = localStorage.getItem("currentRoom");
    if (saved) setRoom(saved);
  }, []);

  // 방 변경 시 localStorage에 저장
  const handleRoomChange = (value: string) => {
    setRoom(value);
    if (value && value !== "새 방 만들기") {
      localStorage.setItem("currentRoom", value);
    }
  };

  // 검색 → 지도 이동
  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setNotice("");
    try {
      const coords = await resolveCity(q);
      if (!coords) {
        setNotice(`"${q}"를 찾을 수 없어요. 다른 도시 이름으로 적어 주세요.`);
        return;
      }
      const map = mapRef.current;
      if (!map) return;
      // setView(좌표, 줌) — 부드럽게 이동
      map.setView(coords as LatLng, 12, { animate: true });
    } catch {
      setNotice("검색 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setSearching(false);
    }
  };

  // 엔터 키로도 검색
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      {/* 맨 위 검은 바 — 타이틀 + 검색 + 여행 방 */}
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--card)] px-4">
        <h1 className="whitespace-nowrap text-lg font-bold tracking-tight">
          🗺️ 여행 핀 지도
        </h1>

        {/* 검색 입력창 + 이동 버튼 */}
        <div className="flex flex-1 items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="도시 이름 (예: 오사카, 가오슝, 후쿠오카)"
            className="h-9 w-full max-w-sm rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            className="h-9 shrink-0 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#5b4dd6] disabled:opacity-50"
          >
            {searching ? "찾는 중…" : "이동"}
          </button>
        </div>

        {/* 여행 방 드롭다운 — 자리만, 기능은 나중에 */}
        <select
          value={room}
          onChange={(e) => handleRoomChange(e.target.value)}
          className="h-9 shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
          aria-label="여행 방 선택"
        >
          <option value="">여행 방 선택</option>
          {ROOMS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </header>

      {/* 검색 결과 안내 (임시) */}
      {notice && (
        <div className="shrink-0 bg-[var(--accent-soft)] px-4 py-2 text-sm text-[var(--text)]">
          {notice}
        </div>
      )}

      {/* 지도(왼쪽 70%) + 사이드바 자리(오른쪽 30%) */}
      <div className="flex flex-1 overflow-hidden">
        <div className="h-[calc(100vh-64px)] w-[70%]">
          <MapView
            onReady={handleMapReady}
            className="h-full w-full"
          />
        </div>

        {/* 사이드바 자리 — 에이전트 B가 채움 */}
        <div
          id="sidebar"
          className="hidden h-[calc(100vh-64px)] w-[30%] border-l border-[var(--border)] bg-[var(--card)] md:block"
        >
          {/* 에이전트 B: 핀 목록, 핀 상세, AI 맛집 찾기 버튼이 여기 들어감 */}
        </div>
      </div>
    </div>
  );
}
