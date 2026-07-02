import { useEffect, useRef, useState } from "react";
import {
  Block, DayData, HOURS, MOODS, P, PRIORITIES, Priority,
  DAY_NAMES, dateKey, loadDay, saveDay, uid,
} from "../lib";

interface Props {
  year: number;
  month: number;
  day: number;
  onBack: () => void;
  onChangeDay: (y: number, m: number, d: number) => void;
}

export default function DayView({ year, month, day, onBack, onChangeDay }: Props) {
  const key = dateKey(year, month, day);
  const [data, setData] = useState<DayData>(() => loadDay(key));

  const [taskInput, setTaskInput] = useState("");
  const [taskPriority, setTaskPriority] = useState<Priority>("mid");
  const [blockTitle, setBlockTitle] = useState("");
  const [blockStart, setBlockStart] = useState(9);
  const [blockEnd, setBlockEnd] = useState(10);
  const [now, setNow] = useState(new Date());

  // 날짜 바뀌면 다시 로드
  useEffect(() => setData(loadDay(key)), [key]);

  // 변경 시 자동 저장 (마운트 직후 제외)
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) saveDay(key, data);
    else mounted.current = true;
  }, [key, data]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const dow = new Date(year, month, day).getDay();
  const isToday =
    now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowTop = isToday && nowHour >= 6 && nowHour <= 24 ? ((nowHour - 6) / 18) * 100 : null;

  const move = (delta: number) => {
    const d = new Date(year, month, day + delta);
    onChangeDay(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const addTask = () => {
    const text = taskInput.trim();
    if (!text) return;
    setData((p) => ({ ...p, tasks: [...p.tasks, { id: uid(), text, done: false, priority: taskPriority }] }));
    setTaskInput("");
  };
  const toggleTask = (id: string) =>
    setData((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
  const removeTask = (id: string) =>
    setData((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== id) }));

  const addBlock = () => {
    const title = blockTitle.trim();
    if (!title || blockEnd <= blockStart) return;
    const nb: Block = { id: uid(), title, start: blockStart, end: blockEnd };
    setData((p) => ({ ...p, blocks: [...p.blocks, nb].sort((a, b) => a.start - b.start) }));
    setBlockTitle("");
  };
  const removeBlock = (id: string) =>
    setData((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== id) }));

  const doneCount = data.tasks.filter((t) => t.done).length;
  const progress = data.tasks.length ? Math.round((doneCount / data.tasks.length) * 100) : 0;

  const inputStyle = { background: P.paper, border: `1px solid ${P.line}` };

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button onClick={onBack} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: P.faint, border: `1px solid ${P.line}` }}>
          ‹ {month + 1}월
        </button>
        <div className="flex items-center gap-4">
          <button onClick={() => move(-1)} className="text-2xl px-2" style={{ color: P.faint }} aria-label="이전 날">‹</button>
          <h1 className="text-xl sm:text-2xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>
            {month + 1}월 {day}일{" "}
            <span style={{ color: dow === 0 ? P.red : dow === 6 ? "#2C5AA0" : P.green }}>
              {DAY_NAMES[dow]}
            </span>요일
            {isToday && (
              <span className="ml-2 text-xs align-middle px-2 py-0.5 rounded-full text-white" style={{ background: P.green }}>
                오늘
              </span>
            )}
          </h1>
          <button onClick={() => move(1)} className="text-2xl px-2" style={{ color: P.faint }} aria-label="다음 날">›</button>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold" style={{ fontFamily: "'Gowun Batang', serif", color: P.green }}>
            {progress}<span className="text-xs">%</span>
          </p>
          <div className="w-20 h-1.5 rounded-full" style={{ background: P.line }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: P.green }} />
          </div>
        </div>
      </div>

      {/* 오늘 기분 */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs" style={{ color: P.faint }}>오늘 기분</span>
        {MOODS.map((m) => (
          <button
            key={m}
            onClick={() => setData((p) => ({ ...p, mood: p.mood === m ? undefined : m }))}
            className={`mood-btn text-lg leading-none rounded-full w-9 h-9 flex items-center justify-center ${data.mood === m ? "on" : ""}`}
            aria-label={`기분 ${m}`}
            style={{
              background: data.mood === m ? P.card : "transparent",
              border: `1.5px solid ${data.mood === m ? P.green : "transparent"}`,
              filter: data.mood && data.mood !== m ? "grayscale(1) opacity(.45)" : "none",
            }}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* 시간표 */}
        <section className="md:col-span-2 rounded-xl p-5" style={{ background: P.card, border: `1px solid ${P.line}` }}>
          <h2 className="text-lg font-bold mb-4" style={{ fontFamily: "'Gowun Batang', serif" }}>시간표</h2>

          <div className="flex gap-2 mb-4 flex-wrap">
            <input
              value={blockTitle}
              onChange={(e) => setBlockTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBlock()}
              placeholder="일정 이름"
              className="flex-1 min-w-[7rem] px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            />
            <select value={blockStart} onChange={(e) => setBlockStart(+e.target.value)}
              className="px-2 py-2 rounded-lg text-sm" style={inputStyle}>
              {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}시</option>)}
            </select>
            <span className="self-center text-sm" style={{ color: P.faint }}>→</span>
            <select value={blockEnd} onChange={(e) => setBlockEnd(+e.target.value)}
              className="px-2 py-2 rounded-lg text-sm" style={inputStyle}>
              {HOURS.map((h) => <option key={h + 1} value={h + 1}>{String(h + 1).padStart(2, "0")}시</option>)}
            </select>
            <button onClick={addBlock} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: P.green }}>
              추가
            </button>
          </div>

          <div className="relative" style={{ height: "540px" }}>
            {HOURS.map((h, i) => (
              <div key={h} className="absolute w-full flex items-start"
                style={{ top: `${(i / 18) * 100}%`, height: `${100 / 18}%` }}>
                <span className="text-[10px] w-8 shrink-0 -mt-1.5" style={{ color: P.faint }}>
                  {String(h).padStart(2, "0")}
                </span>
                <div className="flex-1 border-t" style={{ borderColor: P.line }} />
              </div>
            ))}

            {data.blocks.map((b) => (
              <div key={b.id}
                className="absolute left-9 right-0 rounded-md px-2 py-1 group overflow-hidden"
                style={{
                  top: `${((b.start - 6) / 18) * 100}%`,
                  height: `${((b.end - b.start) / 18) * 100}%`,
                  background: `${P.sage}55`,
                  borderLeft: `3px solid ${P.green}`,
                }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold leading-tight">{b.title}</p>
                    <p className="text-[10px]" style={{ color: P.faint }}>
                      {String(b.start).padStart(2, "0")}:00 – {String(b.end).padStart(2, "0")}:00
                    </p>
                  </div>
                  <button onClick={() => removeBlock(b.id)}
                    className="opacity-0 group-hover:opacity-100 text-xs px-1"
                    style={{ color: P.faint }} aria-label="일정 삭제">✕</button>
                </div>
              </div>
            ))}

            {nowTop !== null && (
              <div className="absolute left-0 right-0 flex items-center pointer-events-none" style={{ top: `${nowTop}%` }}>
                <span className="text-[10px] font-semibold px-1 rounded text-white shrink-0" style={{ background: P.red }}>
                  {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
                </span>
                <div className="flex-1 border-t-2" style={{ borderColor: P.red }} />
              </div>
            )}
          </div>
        </section>

        {/* 할 일 + 메모 */}
        <div className="md:col-span-3 flex flex-col gap-6">
          <section className="relative rounded-xl p-5" style={{ background: P.card, border: `1px solid ${P.line}` }}>
            {data.tasks.length > 0 && progress === 100 && (
              <div className="stamp" aria-hidden="true">
                <span>참 잘했어요</span>
              </div>
            )}
            <h2 className="text-lg font-bold mb-4" style={{ fontFamily: "'Gowun Batang', serif" }}>
              할 일 <span className="text-sm font-normal" style={{ color: P.faint }}>({doneCount}/{data.tasks.length})</span>
            </h2>

            <div className="flex gap-2 mb-2">
              <input
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                placeholder="할 일 입력 후 Enter"
                className="flex-1 px-3 py-2.5 rounded-lg text-sm"
                style={inputStyle}
              />
              <button onClick={addTask} className="px-4 py-2.5 rounded-lg text-sm font-medium text-white" style={{ background: P.green }}>
                추가
              </button>
            </div>

            <div className="flex gap-1.5 mb-4">
              {PRIORITIES.map((p) => (
                <button key={p.id} onClick={() => setTaskPriority(p.id)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: taskPriority === p.id ? p.bg : "transparent",
                    color: taskPriority === p.id ? p.color : P.faint,
                    border: `1px solid ${taskPriority === p.id ? p.color : P.line}`,
                  }}>
                  {p.label}
                </button>
              ))}
            </div>

            <ul className="flex flex-col gap-1">
              {data.tasks.length === 0 && (
                <li className="text-sm py-6 text-center" style={{ color: P.faint }}>
                  아직 할 일이 없어. 위에서 추가해봐.
                </li>
              )}
              {data.tasks.map((t) => {
                const p = PRIORITIES.find((x) => x.id === t.priority) ?? PRIORITIES[1];
                return (
                  <li key={t.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg group"
                    style={{ background: t.done ? "transparent" : P.paper }}>
                    <button onClick={() => toggleTask(t.id)}
                      aria-label={t.done ? "완료 취소" : "완료 표시"}
                      className="w-5 h-5 rounded shrink-0 flex items-center justify-center text-xs font-bold"
                      style={{
                        border: `2px solid ${t.done ? P.green : P.sage}`,
                        background: t.done ? P.green : "transparent",
                        color: "#fff",
                      }}>
                      {t.done ? "✓" : ""}
                    </button>
                    <span className={`hl-swipe flex-1 text-sm ${t.done ? "on" : ""}`}
                      style={{ color: t.done ? P.faint : P.ink }}>
                      {t.text}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: p.bg, color: p.color }}>
                      {p.label}
                    </span>
                    <button onClick={() => removeTask(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-sm px-1 shrink-0"
                      style={{ color: P.faint }} aria-label="할 일 삭제">✕</button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl p-5 flex-1" style={{ background: P.card, border: `1px solid ${P.line}` }}>
            <h2 className="text-lg font-bold mb-3" style={{ fontFamily: "'Gowun Batang', serif" }}>메모</h2>
            <textarea
              value={data.memo}
              onChange={(e) => setData((p) => ({ ...p, memo: e.target.value }))}
              placeholder="떠오르는 생각, 회고, 내일 챙길 것…"
              className="w-full h-36 px-3 py-2.5 rounded-lg text-sm resize-none"
              style={{
                ...inputStyle,
                backgroundImage: `repeating-linear-gradient(transparent, transparent 27px, ${P.line} 28px)`,
                lineHeight: "28px",
              }}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
