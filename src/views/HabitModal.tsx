import { useState } from "react";
import {
  P, DAY_NAMES, Habit, uid, dateKey,
  loadHabits, saveHabits, HABIT_EMOJIS, HABIT_COLORS,
  getStreak, getWeekRate,
} from "../lib";

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

export default function HabitModal({ onClose, onChanged }: Props) {
  const [list, setList] = useState<Habit[]>(() => loadHabits());
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(HABIT_EMOJIS[0]);
  const [color, setColor] = useState(HABIT_COLORS[0]);
  const [days, setDays] = useState<number[]>([]); // 비어있으면 매일

  const persist = (next: Habit[]) => {
    setList(next);
    saveHabits(next);
    onChanged();
  };

  const toggleDay = (d: number) =>
    setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const today = new Date();
    persist([
      ...list,
      {
        id: uid(),
        name: trimmed,
        emoji,
        color,
        targetDays: days.length ? days : undefined,
        createdAt: dateKey(today.getFullYear(), today.getMonth(), today.getDate()),
      },
    ]);
    setName("");
    setDays([]);
  };

  const remove = (id: string) => persist(list.filter((h) => h.id !== id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>습관</h2>
          <button onClick={onClose} className="text-lg px-2" style={{ color: P.faint }} aria-label="닫기">✕</button>
        </div>
        <p className="text-xs mb-5" style={{ color: P.faint }}>
          매일(또는 지정 요일마다) 반복하는 습관을 등록하고 스트릭을 이어가봐. (운동, 물 2L, 독서 등)
        </p>

        {/* 새 습관 입력 */}
        <div className="rounded-xl p-4 mb-5" style={{ background: P.paper }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="습관 이름 (예: 물 2L 마시기)"
            className="w-full px-3 py-2.5 rounded-lg text-sm mb-3"
            style={{ background: P.card, border: `1px solid ${P.line}` }}
          />

          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {HABIT_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className="w-8 h-8 rounded-lg text-base flex items-center justify-center transition-transform"
                style={{
                  background: emoji === e ? P.card : "transparent",
                  border: `1.5px solid ${emoji === e ? P.green : P.line}`,
                  transform: emoji === e ? "scale(1.1)" : "scale(1)",
                }}
                aria-label={`이모지 ${e}`}
              >
                {e}
              </button>
            ))}
          </div>

          <div className="flex gap-1 mb-3">
            {DAY_NAMES.map((d, i) => (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: days.includes(i) ? P.green : "transparent",
                  color: days.includes(i) ? "#fff" : (i === 0 ? P.red : i === 6 ? "#2C5AA0" : P.faint),
                  border: `1px solid ${days.includes(i) ? P.green : P.line}`,
                }}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="text-[11px] mb-3" style={{ color: P.faint }}>
            {days.length === 0 ? "요일을 안 고르면 매일 습관이 돼." : `매주 ${days.map((d) => DAY_NAMES[d]).join("·")}요일만`}
          </p>

          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs" style={{ color: P.faint }}>색상</span>
            {HABIT_COLORS.map((c) => (
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

        {/* 등록된 습관 목록 */}
        {list.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: P.faint }}>아직 습관이 없어.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((h) => {
              const streak = getStreak(h.id);
              const weekRate = getWeekRate(h.id);
              return (
                <li key={h.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: P.paper, borderLeft: `4px solid ${h.color ?? P.green}` }}>
                  <span className="text-lg leading-none shrink-0">{h.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{h.name}</p>
                    <p className="text-xs" style={{ color: P.faint }}>
                      {h.targetDays?.length ? `매주 ${h.targetDays.map((d) => DAY_NAMES[d]).join("·")}` : "매일"}
                      {" · 이번 주 "}{weekRate}%
                    </p>
                  </div>
                  {streak > 0 && (
                    <span className="text-xs font-semibold shrink-0" style={{ color: P.green }}>
                      🔥{streak}
                    </span>
                  )}
                  <button onClick={() => remove(h.id)} className="text-sm px-2 shrink-0" style={{ color: P.faint }} aria-label="삭제">✕</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
