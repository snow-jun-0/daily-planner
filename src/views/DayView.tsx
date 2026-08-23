import { useEffect, useRef, useState } from "react";
import {
  Block, DayData, HOURS, MOODS, P, PRIORITIES, Priority, BLOCK_COLORS,
  DAY_NAMES, dateKey, loadDay, saveDay, uid, recurringForDay,
  MINUTE_OPTIONS, START_MINUTE_OPTIONS, minutesToLabel,
  TIMELINE_START_MIN, TIMELINE_END_MIN, minutesToRow, minutesToRowOffsetPercent, splitIntoRowSegments,
} from "../lib";
import {
  GEvent, hasGoogleConfig,
  listEventsForDate, createEvent, eventToMinutes, findEventByPlannerId,
} from "../gcal";

interface Props {
  year: number;
  month: number;
  day: number;
  recurringVersion: number; // 반복 일정 변경 시 리렌더 트리거
  gSignedIn: boolean; // 구글 캘린더 연결 상태 (상단바와 공유)
  onGSignedInChange: (v: boolean) => void;
  onBack: () => void;
  onChangeDay: (y: number, m: number, d: number) => void;
}

// ---------- 가로 시간표 격자 레이아웃 상수 ----------
// 격자 칸을 정사각형에 가깝게 만들기 위해, 셀 크기는 픽셀 고정값 대신
// 컨테이너 너비 기준 비율(aspect-ratio, %)로 계산한다.
const MINUTE_MARKS = [0, 10, 20, 30, 40, 50];
const LABEL_W = 36; // 왼쪽 시 라벨 열 너비(px)
const HEADER_H = 14; // 상단 분 눈금 헤더 높이(px)
const MIN_CELL_W = 30; // 분 셀 최소 너비(px) — 이보다 좁아지면(좁은 모바일) 가로 스크롤 허용
const MIN_TIMETABLE_W = LABEL_W + MIN_CELL_W * 6;
const ROW_PCT = 100 / HOURS.length; // 시간 격자에서 시(hour) 한 행이 차지하는 세로 비율(%)
const GRID_ASPECT_ROWS = HOURS.length * 0.8; // 격자 전체 세로 길이를 살짝 압축해 빈 공간을 줄임
const HOUR_LINE = "#2A332E"; // 시(hour) 구분용 진한 실선 색
// 형광펜 블록의 셀 안쪽 여백(px) — 좌우는 시작/끝 시각 위치에 정확히 맞추고(0),
// 위아래만 살짝 inset해 행 안에 여백을 준다
const HL_INSET_Y = 4;

export default function DayView({
  year, month, day, recurringVersion, gSignedIn, onGSignedInChange, onBack, onChangeDay,
}: Props) {
  const key = dateKey(year, month, day);
  const [data, setData] = useState<DayData>(() => loadDay(key));

  const [taskInput, setTaskInput] = useState("");
  const [taskPriority, setTaskPriority] = useState<Priority>("mid");
  const [blockTitle, setBlockTitle] = useState("");
  const [blockStart, setBlockStart] = useState(540); // 09:00
  const [blockEnd, setBlockEnd] = useState(600); // 10:00
  const [blockColor, setBlockColor] = useState(BLOCK_COLORS[0].color);
  const [now, setNow] = useState(new Date());
  const memoRef = useRef<HTMLTextAreaElement | null>(null);

  const [gEvents, setGEvents] = useState<GEvent[]>([]);
  const [gBusy, setGBusy] = useState(false);
  const [gMsg, setGMsg] = useState("");

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

  // 메모 textarea를 내용 높이에 맞춰 자동으로 늘림 (내부 스크롤 없이 아래로 확장)
  useEffect(() => {
    const el = memoRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + borderY}px`;
  }, [data.memo]);

  // 반복 일정 변경 시 리렌더 (recurringForDay를 다시 읽기 위함)
  useEffect(() => {}, [recurringVersion]);

  // 날짜나 구글 로그인 상태가 바뀌면 그 날의 구글 캘린더 일정을 불러옴
  useEffect(() => {
    if (!hasGoogleConfig() || !gSignedIn) {
      setGEvents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const events = await listEventsForDate(key);
        if (!cancelled) setGEvents(events);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof Error && e.message === "NOT_SIGNED_IN") {
          onGSignedInChange(false);
          setGEvents([]);
        } else {
          setGMsg("구글 일정을 불러오지 못했어");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, gSignedIn]);

  const exportDayToGoogle = async () => {
    setGBusy(true);
    setGMsg("");
    try {
      const existing = await listEventsForDate(key);
      let created = 0;
      let skipped = 0;
      for (const b of data.blocks) {
        if (findEventByPlannerId(existing, b.id)) {
          skipped++;
          continue;
        }
        await createEvent(key, b.title, b.start, b.end, b.id);
        created++;
      }
      const events = await listEventsForDate(key);
      setGEvents(events);
      setGMsg(`${created}개 등록, ${skipped}개 이미 있음`);
    } catch (e) {
      if (e instanceof Error && e.message === "NOT_SIGNED_IN") {
        onGSignedInChange(false);
        setGMsg("다시 연결해줘");
      } else {
        setGMsg("전송 중 오류가 발생했어");
      }
    } finally {
      setGBusy(false);
    }
  };

  const dow = new Date(year, month, day).getDay();
  const isToday =
    now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowPos =
    isToday && nowMinutes >= TIMELINE_START_MIN && nowMinutes < TIMELINE_END_MIN
      ? { row: minutesToRow(nowMinutes), leftPercent: minutesToRowOffsetPercent(nowMinutes) }
      : null;

  /** 블록의 [start,end)를 타임라인 범위로 clamp한 뒤 행(hour) 단위 구간으로 분할 */
  const computeSegments = (start: number, end: number) => {
    const s = Math.max(start, TIMELINE_START_MIN);
    const e = Math.min(end, TIMELINE_END_MIN);
    if (e <= s) return [];
    return splitIntoRowSegments(s, e);
  };

  /** 구글 일정이 앱 시간표 블록과 같은 시간대에 겹치는지 (겹칠 때만 구분 표시가 필요) */
  const overlapsAppBlock = (start: number, end: number) =>
    data.blocks.some((b) => b.start < end && start < b.end);

  /** 형광펜 블록 하나(행 내 좌우 구간)의 위치·크기 스타일 — 행 높이를 꽉 채우고 좌우/상하로 살짝 inset */
  const segStyle = (s: { row: number; leftPercent: number; widthPercent: number }) => ({
    top: `calc(${s.row * ROW_PCT}% + ${HL_INSET_Y}px)`,
    height: `calc(${ROW_PCT}% - ${HL_INSET_Y * 2}px)`,
    left: `${s.leftPercent}%`,
    width: `${s.widthPercent}%`,
  });

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
    const nb: Block = { id: uid(), title, start: blockStart, end: blockEnd, color: blockColor };
    setData((p) => ({ ...p, blocks: [...p.blocks, nb].sort((a, b) => a.start - b.start) }));
    setBlockTitle("");
  };
  const removeBlock = (id: string) =>
    setData((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== id) }));

  const blockEndOptions = MINUTE_OPTIONS.filter((m) => m > blockStart);
  const onBlockStartChange = (v: number) => {
    setBlockStart(v);
    setBlockEnd((prevEnd) => (prevEnd <= v ? v + 10 : prevEnd));
  };

  const doneCount = data.tasks.filter((t) => t.done).length;
  const progress = data.tasks.length ? Math.round((doneCount / data.tasks.length) * 100) : 0;

  const inputStyle = { background: P.paper, border: `1px solid ${P.line}` };

  return (
    <div>
      {/* 헤더 — 모바일에서는 back+진행률 한 줄, 날짜가 그 아래 전체 폭으로 쌓임 */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-6">
        <button onClick={onBack} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: P.faint, border: `1px solid ${P.line}` }}>
          ‹ {month + 1}월
        </button>
        <div className="order-3 sm:order-none w-full sm:w-auto flex items-center justify-center gap-2 sm:gap-4">
          <button onClick={() => move(-1)} className="text-xl sm:text-2xl px-2" style={{ color: P.faint }} aria-label="이전 날">‹</button>
          <h1 className="text-lg sm:text-2xl font-bold text-center" style={{ fontFamily: "'Gowun Batang', serif" }}>
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
          <button onClick={() => move(1)} className="text-xl sm:text-2xl px-2" style={{ color: P.faint }} aria-label="다음 날">›</button>
        </div>
        <div className="text-right">
          <p className="text-base sm:text-lg font-semibold" style={{ fontFamily: "'Gowun Batang', serif", color: P.green }}>
            {progress}<span className="text-xs">%</span>
          </p>
          <div className="w-16 sm:w-20 h-1.5 rounded-full" style={{ background: P.line }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: P.green }} />
          </div>
        </div>
      </div>

      {/* 오늘 기분 */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-6 flex-wrap">
        <span className="text-xs" style={{ color: P.faint }}>오늘 기분</span>
        {MOODS.map((m) => (
          <button
            key={m}
            onClick={() => setData((p) => ({ ...p, mood: p.mood === m ? undefined : m }))}
            className={`mood-btn text-base sm:text-lg leading-none rounded-full w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center ${data.mood === m ? "on" : ""}`}
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
        {/* 시간표 — 오른쪽 할 일/메모보다 넓게 배치 */}
        <section className="md:col-span-3 rounded-xl p-4" style={{ background: P.card, border: `1px solid ${P.line}` }}>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="text-lg font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>시간표</h2>
            {hasGoogleConfig() && gSignedIn && (
              <button onClick={exportDayToGoogle} disabled={gBusy}
                className="text-xs px-2.5 py-1 rounded-lg font-medium text-white"
                style={{ background: P.green }}>
                구글로 보내기
              </button>
            )}
          </div>
          {gMsg && (
            <p className="text-[11px] mb-2" style={{ color: P.faint }}>{gMsg}</p>
          )}

          <div className="flex gap-2 mb-2 flex-wrap">
            <input
              value={blockTitle}
              onChange={(e) => setBlockTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBlock()}
              placeholder="일정 이름"
              className="flex-1 min-w-[7rem] px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            />
            <select value={blockStart} onChange={(e) => onBlockStartChange(+e.target.value)}
              className="px-2 py-2 rounded-lg text-sm" style={inputStyle}>
              {START_MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{minutesToLabel(m)}</option>)}
            </select>
            <span className="self-center text-sm" style={{ color: P.faint }}>→</span>
            <select value={blockEnd} onChange={(e) => setBlockEnd(+e.target.value)}
              className="px-2 py-2 rounded-lg text-sm" style={inputStyle}>
              {blockEndOptions.map((m) => <option key={m} value={m}>{minutesToLabel(m)}</option>)}
            </select>
            <button onClick={addBlock} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: P.green }}>
              추가
            </button>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs" style={{ color: P.faint }}>색상</span>
            {BLOCK_COLORS.map((c) => (
              <button
                key={c.color}
                onClick={() => setBlockColor(c.color)}
                className="w-5 h-5 rounded-full transition-transform"
                style={{
                  background: c.color,
                  transform: blockColor === c.color ? "scale(1.2)" : "scale(1)",
                  boxShadow: blockColor === c.color ? `0 0 0 2px ${P.card}, 0 0 0 4px ${c.color}` : "none",
                }}
                aria-label={`색상 ${c.name}`}
                title={c.name}
              />
            ))}
          </div>

          <div className="rounded-lg" style={{ border: `1px solid ${P.line}`, overflowX: "auto" }}>
            <div style={{ minWidth: MIN_TIMETABLE_W }}>
              {/* 분 눈금 헤더 (00/10/20/30/40/50) — 00부터 시작해 왼쪽 끝에 붙인다 */}
              <div className="flex" style={{ height: HEADER_H, borderBottom: `1.5px solid ${HOUR_LINE}` }}>
                <div style={{ width: LABEL_W, borderRight: `1.5px solid ${HOUR_LINE}` }} className="shrink-0" />
                <div className="flex-1 grid grid-cols-6">
                  {MINUTE_MARKS.map((m) => (
                    <div key={m} className="text-[9px] text-center" style={{ color: P.faint, lineHeight: `${HEADER_H}px` }}>
                      {String(m).padStart(2, "0")}
                    </div>
                  ))}
                </div>
              </div>

              {/* 시간 격자 본체: 6칸(00~50분)이 항상 컨테이너 너비를 꽉 채우고,
                  격자 영역의 aspect-ratio를 6:행수로 고정해 각 셀이 정사각형에 가깝게 맞춰진다 */}
              <div className="flex">
                <div style={{ width: LABEL_W, borderRight: `1.5px solid ${HOUR_LINE}` }} className="relative shrink-0">
                  {HOURS.map((h, i) => (
                    <div key={h}
                      className="absolute left-0 right-0 flex items-center justify-center text-[10px] leading-none"
                      style={{ top: `${i * ROW_PCT}%`, height: `${ROW_PCT}%`, color: P.faint }}>
                      {String(h).padStart(2, "0")}
                    </div>
                  ))}
                </div>

                <div className="relative flex-1" style={{ aspectRatio: `6 / ${GRID_ASPECT_ROWS}` }}>
                  {/* 시(hour) 구분 진한 실선 */}
                  {HOURS.map((h, i) =>
                    i === 0 ? null : (
                      <div key={h} className="absolute left-0 right-0"
                        style={{ top: `${i * ROW_PCT}%`, borderTop: `1.5px solid ${HOUR_LINE}` }} />
                    )
                  )}
                  {/* 10분 구분 점선 */}
                  {MINUTE_MARKS.map((m, c) =>
                    c === 0 ? null : (
                      <div key={m} className="absolute top-0 bottom-0"
                        style={{ left: `${(c / 6) * 100}%`, borderLeft: `1px dashed ${P.line}` }} />
                    )
                  )}

                  {/* 반복 일정 (요일 기반, 읽기 전용) — 행 전체 높이를 채우는 형광펜 블록 */}
                  {recurringForDay(dow, key).map((b) => {
                    const segs = computeSegments(b.start, b.end);
                    if (segs.length === 0) return null;
                    const primary = segs.reduce((a, s) => (s.widthPercent > a.widthPercent ? s : a), segs[0]);
                    return segs.map((s, si) => (
                      <div key={`${b.id}-${si}`}
                        className="absolute px-1 overflow-hidden pointer-events-none flex items-center"
                        title={`${b.title} · ${minutesToLabel(b.start)}–${minutesToLabel(b.end)}`}
                        style={{
                          ...segStyle(s),
                          background: `${b.color ?? P.green}22`,
                          borderLeft: `2px dashed ${b.color ?? P.green}`,
                          borderRadius: 3,
                        }}>
                        {s === primary && (
                          <span className="text-[9px] font-semibold whitespace-nowrap" style={{ color: b.color ?? P.green }}>
                            ↻ {b.title}
                          </span>
                        )}
                      </div>
                    ));
                  })}

                  {/* 앱 시간표 블록 — 행 전체 높이를 채우는 형광펜 블록 */}
                  {data.blocks.map((b) => {
                    const segs = computeSegments(b.start, b.end);
                    if (segs.length === 0) return null;
                    const primary = segs.reduce((a, s) => (s.widthPercent > a.widthPercent ? s : a), segs[0]);
                    return segs.map((s, si) => (
                      <div key={`${b.id}-${si}`}
                        className="absolute px-1 group overflow-hidden"
                        title={`${b.title} · ${minutesToLabel(b.start)}–${minutesToLabel(b.end)}`}
                        style={{
                          ...segStyle(s),
                          background: `${b.color ?? P.sage}44`,
                          borderLeft: `3px solid ${b.color ?? P.green}`,
                          borderRadius: 3,
                        }}>
                        <div className="flex justify-between items-center h-full gap-1">
                          {s === primary && (
                            <span className="text-[9px] font-semibold whitespace-nowrap leading-none">{b.title}</span>
                          )}
                          <button onClick={() => removeBlock(b.id)}
                            className="opacity-0 group-hover:opacity-100 text-[9px] px-0.5 shrink-0 ml-auto"
                            style={{ color: P.faint }} aria-label="일정 삭제">✕</button>
                        </div>
                      </div>
                    ));
                  })}

                  {/* 구글 캘린더 일정 (앱이 이 시간표에서 내보낸 이벤트는 중복 표시하지 않음)
                      앱 블록과 겹치지 않으면 행 전체를 꽉 채우고, 겹칠 때만 반투명 + 점선 테두리로 얹어 구분한다 */}
                  {gEvents
                    .filter((ev) => {
                      const priv = ev.extendedProperties?.private;
                      if (priv?.plannerSource !== "daily-planner") return true;
                      // 앱에서 내보낸 이벤트는, 대응하는 로컬 블록이 실제로 있을 때만 숨긴다
                      // (다른 기기/초기화된 기기에는 로컬 블록이 없으므로 그대로 표시)
                      const plannerId = priv?.plannerId;
                      const hasLocalBlock = !!plannerId && data.blocks.some((b) => b.id === plannerId);
                      return !hasLocalBlock;
                    })
                    .map((ev) => {
                      const minutes = eventToMinutes(ev);
                      if (!minutes) return null;
                      const segs = computeSegments(minutes.start, minutes.end);
                      if (segs.length === 0) return null;
                      const overlapping = overlapsAppBlock(minutes.start, minutes.end);
                      const primary = segs.reduce((a, s) => (s.widthPercent > a.widthPercent ? s : a), segs[0]);
                      return segs.map((s, si) => (
                        <div key={`${ev.id}-${si}`}
                          className="absolute px-1 overflow-hidden pointer-events-none flex items-center"
                          title={`${ev.summary || "(제목 없음)"} · ${minutesToLabel(minutes.start)}–${minutesToLabel(minutes.end)}`}
                          style={{
                            ...segStyle(s),
                            background: overlapping ? "#4285F42E" : "#4285F41A",
                            border: overlapping ? "1.5px dashed #4285F4" : "none",
                            borderLeft: overlapping ? "1.5px dashed #4285F4" : "2px solid #4285F4",
                            borderRadius: 3,
                          }}>
                          {s === primary && (
                            <span className="text-[8px] font-semibold whitespace-nowrap leading-none" style={{ color: "#4285F4" }}>
                              G {ev.summary || "(제목 없음)"}
                            </span>
                          )}
                        </div>
                      ));
                    })}

                  {/* 현재 시각 세로선 (오늘 날짜일 때만) */}
                  {nowPos && (
                    <div className="absolute pointer-events-none"
                      style={{ top: `${nowPos.row * ROW_PCT}%`, height: `${ROW_PCT}%`, left: `${nowPos.leftPercent}%` }}>
                      <div className="h-full" style={{ borderLeft: `2px solid ${P.red}` }} />
                      <span className="absolute text-[9px] font-semibold px-1 rounded text-white whitespace-nowrap"
                        style={{ background: P.red, top: -15, left: 0, transform: "translateX(-50%)" }}>
                        {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 할 일 + 메모 — 슬림하게 */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <section className="relative rounded-xl p-4" style={{ background: P.card, border: `1px solid ${P.line}` }}>
            {data.tasks.length > 0 && progress === 100 && (
              <div className="stamp" aria-hidden="true">
                <span>참 잘했어요</span>
              </div>
            )}
            <h2 className="text-base font-bold mb-3" style={{ fontFamily: "'Gowun Batang', serif" }}>
              할 일 <span className="text-xs font-normal" style={{ color: P.faint }}>({doneCount}/{data.tasks.length})</span>
            </h2>

            <div className="flex gap-2 mb-2">
              <input
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                placeholder="할 일 입력 후 Enter"
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={inputStyle}
              />
              <button onClick={addTask} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: P.green }}>
                추가
              </button>
            </div>

            <div className="flex gap-1.5 mb-3">
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
                <li className="text-sm py-4 text-center" style={{ color: P.faint }}>
                  아직 할 일이 없어. 위에서 추가해봐.
                </li>
              )}
              {data.tasks.map((t) => {
                const p = PRIORITIES.find((x) => x.id === t.priority) ?? PRIORITIES[1];
                return (
                  <li key={t.id} className="flex items-center gap-2 px-2 py-2 rounded-lg group"
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

          <section className="rounded-xl p-4" style={{ background: P.card, border: `1px solid ${P.line}` }}>
            <h2 className="text-base font-bold mb-2" style={{ fontFamily: "'Gowun Batang', serif" }}>메모</h2>
            <textarea
              ref={memoRef}
              value={data.memo}
              onChange={(e) => setData((p) => ({ ...p, memo: e.target.value }))}
              placeholder="떠오르는 생각, 회고, 내일 챙길 것…"
              rows={5}
              className="w-full px-3 py-2.5 rounded-lg text-sm resize-none"
              style={{
                ...inputStyle,
                minHeight: 162, // 5줄(줄높이 28px) + 상하 패딩 만큼의 최소 높이
                overflow: "hidden", // 내부 스크롤 없이, 내용에 따라 JS로 높이를 늘림
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
