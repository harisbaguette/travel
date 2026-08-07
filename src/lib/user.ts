"use client";

// 로그인 없이 브라우저를 식별하는 임시 사용자 ID.
// localStorage에 UUID를 한 번 만들어 두고 계속 씀. 핀의 createdBy에 저장.
const KEY = "travel-user-id";

function uuid(): string {
  // crypto.randomUUID가 있으면 쓰고, 없으면 Math.random으로 대체.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getUserId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = uuid();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}