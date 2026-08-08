"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import type { ChecklistItem } from "@/lib/types";

interface ChecklistCardProps {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  /** 새 항목 입력칸에 보여줄 예시 글 */
  placeholder: string;
  /** 항목마다 담당자 칸을 붙일지 — 장보기(누가 사 올지)·짐 챙기기(누가 챙길지)에서 사용 */
  withAssignee?: boolean;
  /** 항목마다 결과 칸을 붙일지 — 회의에서 안건별 결정 내용을 적는다 */
  withResult?: boolean;
}

// 체크리스트 한 장 — 짐 챙기기·회의 안건·장보기가 같은 모양을 쓴다.
// 위 입력칸에 적고 엔터(또는 + 단추)로 추가, 동그라미를 누르면 체크된다.
export default function ChecklistCard({
  items,
  onChange,
  placeholder,
  withAssignee = false,
  withResult = false,
}: ChecklistCardProps) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([
      ...items,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text,
        done: false,
      },
    ]);
    setDraft("");
  };

  const patch = (id: string, p: Partial<ChecklistItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const remove = (id: string) => onChange(items.filter((i) => i.id !== id));

  return (
    <div className="dw-card flex flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // 한글 입력 중 조합 확정 엔터는 무시 — 미완성 글자가 추가되는 것 방지
            if (e.key === "Enter" && !e.nativeEvent.isComposing) add();
          }}
          placeholder={placeholder}
          className="dw-input dw-input--sm min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={add}
          className="dw-btn-ghost h-10 w-10 min-h-0 shrink-0 p-0"
          aria-label="항목 추가"
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden />
        </button>
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1.5 rounded-[12px] bg-[var(--bg)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => patch(item.id, { done: !item.done })}
                  aria-pressed={item.done}
                  aria-label={`${item.text} ${item.done ? "체크 풀기" : "체크하기"}`}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    item.done
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--border-strong)] text-transparent"
                  }`}
                >
                  <Check size={13} strokeWidth={3} aria-hidden />
                </button>
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    item.done
                      ? "text-[var(--text-faint)] line-through"
                      : "text-[var(--text)]"
                  }`}
                >
                  {item.text}
                </span>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors duration-200 hover:bg-[var(--surface-hover)] hover:text-[var(--danger)]"
                  aria-label={`${item.text} 삭제`}
                >
                  <X size={15} strokeWidth={2.2} aria-hidden />
                </button>
              </div>
              {/* 담당자 칸 — 항목 바로 아래에 조그맣게, 누가 맡을지 적는다. */}
              {withAssignee && (
                <input
                  type="text"
                  value={item.assignee ?? ""}
                  onChange={(e) => patch(item.id, { assignee: e.target.value })}
                  placeholder="누가"
                  className="dw-input dw-input--who"
                  aria-label={`${item.text} 담당자`}
                />
              )}
              {/* 결과 칸 — 회의에서 안건마다 "무엇으로 정해졌는지"를 바로 아래에 적는다. */}
              {withResult && (
                <input
                  type="text"
                  value={item.result ?? ""}
                  onChange={(e) => patch(item.id, { result: e.target.value })}
                  placeholder="결과 — 정해진 내용"
                  className="dw-input dw-input--sm dw-input--result text-xs"
                  aria-label={`${item.text} 회의 결과`}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
