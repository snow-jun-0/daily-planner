import { useState } from "react";
import { P, PRIORITIES, MONTH_NAMES, DAY_NAMES, allIncompleteTasks, markTaskDone } from "../lib";

interface Props {
  onClose: () => void;
  onSelectDate: (y: number, m: number, d: number) => void;
}

export default function TodosModal({ onClose, onSelectDate }: Props) {
  const [items, setItems] = useState(() => allIncompleteTasks());

  const complete = (date: string, taskId: string) => {
    markTaskDone(date, taskId);
    setItems((p) => p.filter((it) => !(it.date === date && it.task.id === taskId)));
  };

  const goTo = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    onSelectDate(y, m - 1, d);
    onClose();
  };

  const formatDate = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return `${MONTH_NAMES[m - 1]} ${d}일 (${DAY_NAMES[dow]})`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>전체 할 일</h2>
          <button onClick={onClose} className="text-lg px-2" style={{ color: P.faint }} aria-label="닫기">✕</button>
        </div>
        <p className="text-xs mb-5" style={{ color: P.faint }}>
          모든 날짜의 완료하지 않은 할 일을 모아서 보여줘.
        </p>

        {items.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: P.faint }}>완료 안 한 할 일이 없어</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map(({ date, task }) => {
              const p = PRIORITIES.find((x) => x.id === task.priority) ?? PRIORITIES[1];
              return (
                <li key={`${date}-${task.id}`}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-lg group"
                  style={{ background: P.paper }}>
                  <button onClick={() => complete(date, task.id)}
                    aria-label="완료 표시"
                    className="w-5 h-5 rounded shrink-0 flex items-center justify-center text-xs font-bold"
                    style={{ border: `2px solid ${P.sage}`, background: "transparent" }}>
                  </button>
                  <button onClick={() => goTo(date)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm truncate" style={{ color: P.ink }}>{task.text}</p>
                    <p className="text-[10px]" style={{ color: P.faint }}>{formatDate(date)}</p>
                  </button>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                    style={{ background: p.bg, color: p.color }}>
                    {p.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
