import { useMemo } from "react";
import { P } from "../lib";

interface Props {
  year: number; // 현재 보고 있는 연도 (강조 표시용)
  onSelectYear: (y: number) => void;
  onBack: () => void;
}

export default function YearPickerView({ year, onSelectYear, onBack }: Props) {
  // 오늘 기준 ±5년. 현재 보고 있는 연도가 범위 밖이면 포함되도록 확장.
  const years = useMemo(() => {
    const base = new Date().getFullYear();
    let start = base - 5;
    let end = base + 5;
    if (year < start) start = year;
    if (year > end) end = year;
    const list: number[] = [];
    for (let y = start; y <= end; y++) list.push(y);
    return list;
  }, [year]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={onBack}
          className="flex items-center justify-center text-xl leading-none w-7 h-7 shrink-0"
          style={{ color: P.faint }}
          aria-label="뒤로"
        >
          ‹
        </button>
        <h1 className="font-bold leading-none" style={{ fontFamily: "'Gowun Batang', serif", fontSize: 22, color: P.ink }}>
          연도 선택
        </h1>
      </div>

      <div className="card">
        <div className="grid grid-cols-3 gap-2.5">
          {years.map((y) => {
            const isCurrent = y === year;
            return (
              <button
                key={y}
                onClick={() => onSelectYear(y)}
                className="rounded-xl py-3 text-center font-bold transition-transform hover:-translate-y-0.5"
                style={{
                  fontFamily: "'Gowun Batang', serif",
                  fontSize: 16,
                  background: isCurrent ? P.green : P.card,
                  color: isCurrent ? "#fff" : P.ink,
                  border: `1px solid ${isCurrent ? P.green : P.line}`,
                  boxShadow: isCurrent ? `0 0 0 2px color-mix(in srgb, ${P.green} 20%, transparent)` : "none",
                }}
              >
                {y}년
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
