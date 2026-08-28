import { useMemo, useState } from "react";
import { P, DAY_NAMES, MONTH_NAMES, dateKey, allMemos } from "../lib";

interface Props {
  onSelectDate: (y: number, m: number, d: number) => void;
}

type SortOrder = "desc" | "asc";

const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
  { id: "desc", label: "최신순" },
  { id: "asc", label: "오래된순" },
];

function formatDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${MONTH_NAMES[m - 1]} ${d}일 (${DAY_NAMES[dow]})`;
}

export default function MemoView({ onSelectDate }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("desc");
  // 탭을 열 때마다 컴포넌트가 새로 마운트되므로 여기서 한 번만 읽어도 항상 최신 데이터
  const memos = useMemo(() => allMemos(), []);

  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? memos.filter(
          (m) =>
            m.memo.toLowerCase().includes(q) ||
            formatDate(m.date).toLowerCase().includes(q) ||
            m.date.includes(q)
        )
      : memos;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    return sort === "desc" ? sorted.reverse() : sorted;
  }, [memos, query, sort]);

  const goTo = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    onSelectDate(y, m - 1, d);
  };

  return (
    <div className="flex flex-col gap-4">
      <p style={{ fontFamily: "'Gowun Batang', serif", fontSize: 20, color: P.ink, fontWeight: 700 }}>메모</p>

      {/* 검색 + 정렬 */}
      <div className="flex flex-col gap-2">
        <div className="card flex items-center gap-2" style={{ padding: "10px 14px" }}>
          <span style={{ color: P.faint, fontSize: 14 }} aria-hidden="true">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메모 검색"
            className="flex-1 min-w-0 text-sm bg-transparent outline-none"
            style={{ color: P.ink }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSort(opt.id)}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: sort === opt.id ? P.green : "transparent",
                  color: sort === opt.id ? "#fff" : P.faint,
                  border: `1px solid ${sort === opt.id ? P.green : P.line}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-xs shrink-0" style={{ color: P.faint }}>메모 {filtered.length}개</span>
        </div>
      </div>

      {/* 리스트 */}
      {filtered.length === 0 ? (
        <div className="card flex items-center justify-center" style={{ minHeight: 200 }}>
          <p className="text-sm" style={{ color: P.faint }}>
            {memos.length === 0 ? "아직 메모가 없어요" : "검색 결과가 없어요"}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map(({ date, memo }) => (
            <li key={date}>
              <button onClick={() => goTo(date)} className="card w-full text-left block transition-transform hover:-translate-y-0.5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold" style={{ color: P.green, fontSize: 14 }}>
                    {formatDate(date)}
                  </span>
                  {date === todayKey && (
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: `color-mix(in srgb, ${P.highlight} 33%, transparent)`, color: "var(--highlight-ink)" }}
                    >
                      오늘
                    </span>
                  )}
                </div>
                <p
                  className="text-sm whitespace-pre-wrap"
                  style={{
                    color: P.ink,
                    display: "-webkit-box",
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {memo}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
