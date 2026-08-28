import { useMemo } from "react";
import { DAY_NAMES, MONTH_NAMES, P, monthsWithData, daysWithData } from "../lib";

interface Props {
  year: number;
  onSelectMonth: (m: number) => void;
  onChangeYear: (y: number) => void;
}

function MiniMonth({ year, month, onClick }: { year: number; month: number; onClick: () => void }) {
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;
  const marked = useMemo(() => daysWithData(year, month), [year, month]);
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl p-3 transition-transform hover:-translate-y-0.5"
      style={{
        background: P.card,
        border: `1px solid ${isThisMonth ? P.green : P.line}`,
        boxShadow: isThisMonth ? `0 0 0 2px color-mix(in srgb, ${P.green} 20%, transparent)` : "none",
      }}
    >
      <p
        className="text-sm font-bold mb-2"
        style={{ fontFamily: "'Gowun Batang', serif", color: isThisMonth ? P.green : P.ink }}
      >
        {MONTH_NAMES[month]}
      </p>
      <div className="grid grid-cols-7 gap-0.5">
        {DAY_NAMES.map((d) => (
          <span key={d} className="text-[8px] text-center" style={{ color: P.faint }}>
            {d}
          </span>
        ))}
        {Array.from({ length: first }).map((_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const d = i + 1;
          const isToday = isThisMonth && today.getDate() === d;
          return (
            <span
              key={d}
              className="text-[9px] text-center rounded-full leading-4"
              style={{
                background: isToday ? P.green : marked.has(d) ? `color-mix(in srgb, ${P.highlight} 53%, transparent)` : "transparent",
                color: isToday ? "#fff" : P.ink,
                fontWeight: isToday || marked.has(d) ? 600 : 400,
              }}
            >
              {d}
            </span>
          );
        })}
      </div>
    </button>
  );
}

export default function YearView({ year, onSelectMonth, onChangeYear }: Props) {
  const hasData = useMemo(() => monthsWithData(year), [year]);

  return (
    <div>
      <div className="flex items-center justify-center gap-6 mb-6">
        <button onClick={() => onChangeYear(year - 1)} className="text-2xl px-2" style={{ color: P.faint }} aria-label="이전 연도">
          ‹
        </button>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>
          {year}년
        </h1>
        <button onClick={() => onChangeYear(year + 1)} className="text-2xl px-2" style={{ color: P.faint }} aria-label="다음 연도">
          ›
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {MONTH_NAMES.map((_, m) => (
          <div key={m} className="relative">
            <MiniMonth year={year} month={m} onClick={() => onSelectMonth(m)} />
            {hasData.has(m) && (
              <span
                className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full"
                style={{ background: P.green }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
