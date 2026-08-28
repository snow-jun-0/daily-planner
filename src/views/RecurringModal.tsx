import { useState } from "react";
import {
  P, DAY_NAMES, RecurringBlock, uid, loadRecurring, saveRecurring,
  MINUTE_OPTIONS, START_MINUTE_OPTIONS, minutesToLabel,
} from "../lib";

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

const COLORS = ["#2F6B4F", "#2C5AA0", "#C0392B", "#B8860B", "#7D3C98", "#0E7490"];

export default function RecurringModal({ onClose, onChanged }: Props) {
  const [list, setList] = useState<RecurringBlock[]>(() => loadRecurring());
  const [title, setTitle] = useState("");
  const [days, setDays] = useState<number[]>([1]); // 기본 월요일
  const [start, setStart] = useState(540); // 09:00
  const [end, setEnd] = useState(660); // 11:00
  const [color, setColor] = useState(COLORS[0]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const persist = (next: RecurringBlock[]) => {
    setList(next);
    saveRecurring(next);
    onChanged();
  };

  const toggleDay = (d: number) =>
    setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));

  const endOptions = MINUTE_OPTIONS.filter((m) => m > start);
  const onStartChange = (v: number) => {
    setStart(v);
    setEnd((prevEnd) => (prevEnd <= v ? v + 10 : prevEnd));
  };

  const add = () => {
    if (!title.trim() || days.length === 0 || end <= start) return;
    persist([
      ...list,
      {
        id: uid(),
        title: title.trim(),
        days,
        start,
        end,
        color,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
    ]);
    setTitle("");
    setStartDate("");
    setEndDate("");
  };

  const remove = (id: string) => persist(list.filter((r) => r.id !== id));

  const inputStyle = { background: P.paper, border: `1px solid ${P.line}` };

  const formatMD = (d: string) => {
    const [, m, day] = d.split("-");
    return `${+m}/${+day}`;
  };
  const formatRange = (r: RecurringBlock) => {
    if (!r.startDate && !r.endDate) return "";
    if (r.startDate && r.endDate) return `${formatMD(r.startDate)}~${formatMD(r.endDate)}`;
    if (r.startDate) return `${formatMD(r.startDate)}~`;
    return `~${formatMD(r.endDate!)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>반복 일정</h2>
          <button onClick={onClose} className="text-lg px-2" style={{ color: P.faint }} aria-label="닫기">✕</button>
        </div>
        <p className="text-xs mb-5" style={{ color: P.faint }}>
          매주 정해진 요일·시간에 자동으로 시간표에 표시돼. (수업, 알바, 운동 등)
        </p>

        {/* 새 반복 일정 입력 */}
        <div className="rounded-xl p-4 mb-5" style={{ background: P.paper }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="일정 이름 (예: 자료구조 수업)"
            className="w-full px-3 py-2.5 rounded-lg text-sm mb-3"
            style={{ background: P.card, border: `1px solid ${P.line}` }}
          />

          <div className="flex gap-1 mb-3">
            {DAY_NAMES.map((name, d) => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: days.includes(d) ? P.green : "transparent",
                  color: days.includes(d) ? "#fff" : (d === 0 ? P.red : d === 6 ? P.blue : P.faint),
                  border: `1px solid ${days.includes(d) ? P.green : P.line}`,
                }}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <select value={start} onChange={(e) => onStartChange(+e.target.value)} className="flex-1 px-2 py-2 rounded-lg text-sm" style={inputStyle}>
              {START_MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{minutesToLabel(m)}</option>)}
            </select>
            <span className="text-sm" style={{ color: P.faint }}>→</span>
            <select value={end} onChange={(e) => setEnd(+e.target.value)} className="flex-1 px-2 py-2 rounded-lg text-sm" style={inputStyle}>
              {endOptions.map((m) => <option key={m} value={m}>{minutesToLabel(m)}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2 mb-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: P.faint }}>시작일</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-2 rounded-lg text-sm"
                style={inputStyle}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: P.faint }}>종료일</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-2 rounded-lg text-sm"
                style={inputStyle}
              />
            </label>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs" style={{ color: P.faint }}>색상</span>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full transition-transform"
                style={{ background: c, transform: color === c ? "scale(1.2)" : "scale(1)", boxShadow: color === c ? `0 0 0 2px ${P.card}, 0 0 0 4px ${c}` : "none" }}
                aria-label={`색상 ${c}`}
              />
            ))}
          </div>

          <button onClick={add} className="w-full py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: P.green }}>
            추가
          </button>
        </div>

        {/* 등록된 반복 일정 목록 */}
        {list.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: P.faint }}>아직 반복 일정이 없어.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: P.paper, borderLeft: `4px solid ${r.color ?? P.green}` }}>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{r.title}</p>
                  <p className="text-xs" style={{ color: P.faint }}>
                    매주 {r.days.map((d) => DAY_NAMES[d]).join("·")} · {minutesToLabel(r.start)}–{minutesToLabel(r.end)}
                    {formatRange(r) && ` · ${formatRange(r)}`}
                  </p>
                </div>
                <button onClick={() => remove(r.id)} className="text-sm px-2" style={{ color: P.faint }} aria-label="삭제">✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
