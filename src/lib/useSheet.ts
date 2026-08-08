"use client";

import { useEffect, useRef } from "react";

// 바닥에서 올라오는 창(시트)의 공통 손놀림:
// ESC를 누르면 닫히고, 열려 있는 동안 뒤 화면은 안 밀리고, 닫으면 원래 자리로 초점이 돌아온다.
export function useSheet(onClose: () => void): void {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      returnTo?.focus?.();
    };
  }, []);
}
