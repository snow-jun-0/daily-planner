import { useState } from "react";
import { DAY_NAMES, MONTH_NAMES, P, dateKey } from "../lib";

interface Props {
  value: string; // "YYYY-MM-DD" 또는 ""
  onChange: (v: string) => void;
}

/** 앱 스타일 미니 달력 — 월 이동 + 날짜 그리드. MonthView의 달력 렌더링을 축소·재활용. */
export default function MiniCalendar({ value, onChange }: Props) {
  const today = new Date();
  const sel = value ? new Date(`${value}T00:00:00`) : null;
  const [viewY, setViewY] = useState(sel ? sel.getFullYear() : today.getFullYear());
  const [viewM, setViewM] = useState(sel ? sel.getMonth() : today.getMonth());

  const first = new Date(viewY, viewM, 1).getDay();
  const days = new Date(viewY, viewM + 1, 0).getDate();

  const prev = () => (viewM === 0 ? (setViewY(viewY - 1), setViewM(11)) : setViewM(viewM - 1));
  const next = () => (viewM === 11 ? (setViewY(viewY + 1), setViewM(0)) : setViewM(viewM + 1));

  return (
    <div
      className="rounded-xl p-3"
      style={{ background: P.card, border: `1px solid ${P.line}`, boxShadow: "0 8px 24px rgba(33,48,41,0.18)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prev} className="w-7 h-7 flex items-center justify-center text-lg leading-none" style={{ color: P.faint }} aria-label="이전 달">‹</button>
        <span className="text-sm font-bold" style={{ fontFamily: "'Gowun Batang', serif", color: P.ink }}>
          {viewY}년 {MONTH_NAMES[viewM]}
        </span>
        <button type="button" onClick={next} className="w-7 h-7 flex items-center justify-center text-lg leading-none" style={{ color: P.faint }} aria-label="다음 달">›</button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAY_NAMES.map((d, i) => (
          <span key={d} className="text-center text-[10px] py-1" style={{ color: i === 0 ? P.red : i === 6 ? P.blue : P.faint }}>
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: first }).map((_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const d = i + 1;
          const key = dateKey(viewY, viewM, d);
          const dow = (first + i) % 7;
          const isToday = today.getFullYear() === viewY && today.getMonth() === viewM && today.getDate() === d;
          const isSel = value === key;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(key)}
              className="aspect-square flex items-center justify-center rounded-full text-xs transition-transform hover:-translate-y-0.5"
              style={{
                background: isSel ? P.green : "transparent",
                color: isSel ? "#fff" : dow === 0 ? P.red : dow === 6 ? P.blue : P.ink,
                fontWeight: isSel || isToday ? 700 : 400,
                border: !isSel && isToday ? `1px solid ${P.green}` : "1px solid transparent",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
