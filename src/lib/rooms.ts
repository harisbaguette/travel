// 여행 목록 — 상단 드롭다운에서 고르는 "프로젝트"(내부적으로는 방/room).
export interface Room {
  id: string;
  label: string;
  color: string;
}

const KEY = "travel-rooms";
const COLORS = ["#3d79c0", "#df4b46", "#2f9e6e", "#d98324", "#7a5cc4"];

export const DEFAULT_ROOM: Room = {
  id: "푸꾸옥",
  label: "푸꾸옥 맵",
  color: COLORS[0],
};

// 정리된 예전 방 — 목록에 되살아나지 않게 걸러낸다.
export const OLD_ROOMS = ["오사카 5월", "가오슝 6월"];

function isRoom(v: unknown): v is Room {
  const r = v as Partial<Room> | null;
  return (
    typeof r?.id === "string" &&
    typeof r?.label === "string" &&
    typeof r?.color === "string"
  );
}

// 기본 여행은 항상 맨 앞. 그 뒤로 내가 들렀던 여행들.
export function loadRooms(): Room[] {
  if (typeof window === "undefined") return [DEFAULT_ROOM];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = (Array.isArray(parsed) ? parsed.filter(isRoom) : []).filter(
      (r) => !OLD_ROOMS.includes(r.id)
    );
    // 기본 여행은 이름을 바꿨을 수 있으므로 저장본이 있으면 그것을 쓴다.
    const saved = list.find((r) => r.id === DEFAULT_ROOM.id);
    return [
      saved ?? DEFAULT_ROOM,
      ...list.filter((r) => r.id !== DEFAULT_ROOM.id),
    ];
  } catch {
    return [DEFAULT_ROOM];
  }
}

export function saveRooms(rooms: Room[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rooms));
  } catch {
    // 용량 초과 등은 무시
  }
}

// 여행 이름 바꾸기 — 초대 링크로 들어와 이름이 암호처럼 보이는 여행을 알아보기 쉽게.
export function renameRoom(rooms: Room[], id: string, label: string): Room[] {
  const name = label.trim();
  if (!name) return rooms;
  return rooms.map((r) => (r.id === id ? { ...r, label: name } : r));
}

// 처음 보는 여행이면 목록에 넣는다(초대 링크로 들어온 경우 포함).
export function addRoom(rooms: Room[], id: string, label?: string): Room[] {
  if (!id || OLD_ROOMS.includes(id) || rooms.some((r) => r.id === id)) return rooms;
  return [
    ...rooms,
    { id, label: label?.trim() || id, color: COLORS[rooms.length % COLORS.length] },
  ];
}

export function findRoom(rooms: Room[], id: string): Room {
  return rooms.find((r) => r.id === id) ?? DEFAULT_ROOM;
}
