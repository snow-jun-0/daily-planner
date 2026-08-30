import { useEffect, useRef, useState } from "react";
import {
  Block, DayData, HOURS, P, PRIORITIES, Priority,
  DAY_NAMES, dateKey, loadDay, saveDay, uid, recurringForDay, loadRecurring,
  minutesToLabel,
  TIMELINE_START_MIN, TIMELINE_END_MIN, minutesToRow, minutesToRowOffsetPercent, splitIntoRowSegments,
  assignLanes, LaneAssignment,
  habitsForDate, isHabitDone, setHabitDone, getStreak,
} from "../lib";
import {
  GEvent, hasGoogleConfig,
  listEventsForDate, createEvent, deleteEvent, eventToMinutes, findEventByPlannerId, isAllDayEvent, eventUid,
} from "../gcal";
import GhostButton from "./GhostButton";
import TimeBlockFormModal from "./TimeBlockFormModal";
import TaskFormModal from "./TaskFormModal";
import ConfirmModal from "./ConfirmModal";

interface Props {
  year: number;
  month: number;
  day: number;
  recurringVersion: number; // 반복 일정 변경 시 리렌더 트리거
  habitsVersion: number; // 습관 목록 변경 시 리렌더 트리거
  gSignedIn: boolean; // 구글 캘린더 연결 상태 (상단바와 공유)
  onGSignedInChange: (v: boolean) => void;
  onBack: () => void;
  onChangeDay: (y: number, m: number, d: number) => void;
  onStartFocus: (title: string) => void;
  onTasksProgressChange?: (done: number, total: number) => void; // 상단 오늘 요약카드의 완료율 표시용
  onOpenRecurring: () => void; // 반복 일정 모달 열기
  onOpenTodos: () => void; // 전체 할 일 모달 열기
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
const HOUR_LINE = "var(--grid-line)"; // 시(hour) 구분용 진한 실선 색
// 형광펜 블록의 셀 안쪽 여백(px) — 좌우는 시작/끝 시각 위치에 정확히 맞추고(0),
// 위아래만 살짝 inset해 행 안에 여백을 준다
const HL_INSET_Y = 4;

export default function DayView({
  year, month, day, recurringVersion, habitsVersion, gSignedIn, onGSignedInChange, onBack, onChangeDay, onStartFocus,
  onTasksProgressChange, onOpenRecurring, onOpenTodos,
}: Props) {
  const key = dateKey(year, month, day);
  const [data, setData] = useState<DayData>(() => loadDay(key));
  const [, setHabitTick] = useState(0); // 습관 체크 시 리렌더 트리거용 (기록 자체는 별도 저장소에 저장)

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [now, setNow] = useState(new Date());
  const memoRef = useRef<HTMLTextAreaElement | null>(null);

  const [gEvents, setGEvents] = useState<GEvent[]>([]);
  const [gBusy, setGBusy] = useState(false);
  const [gMsg, setGMsg] = useState("");
  const [pendingGDelete, setPendingGDelete] = useState<GEvent | null>(null); // 구글 일정 삭제 확인 모달 대상

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
  // 습관 목록 변경 시 리렌더 (habitsForDate를 다시 읽기 위함)
  useEffect(() => {}, [habitsVersion]);

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
      const idMap = new Map<string, string>(); // 블록 id → 구글 이벤트 id (삭제 시 대응 이벤트를 찾기 위해 로컬에 저장)
      for (const b of data.blocks) {
        const already = findEventByPlannerId(existing, b.id);
        if (already) {
          idMap.set(b.id, already.id);
          skipped++;
          continue;
        }
        const ev = await createEvent(key, b.title, b.start, b.end, b.id);
        idMap.set(b.id, ev.id);
        created++;
      }
      if (idMap.size > 0) {
        setData((p) => ({
          ...p,
          blocks: p.blocks.map((b) => (idMap.has(b.id) ? { ...b, googleEventId: idMap.get(b.id) } : b)),
        }));
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

  /** 형광펜 블록 하나(행 내 좌우 구간)의 위치·크기 스타일.
   *  안 겹치면(laneCount=1) 행 높이를 꽉 채우고, 겹치면 그 그룹 레인 수만큼 세로로 등분한다 */
  const segStyle = (
    s: { row: number; leftPercent: number; widthPercent: number },
    lane = 0,
    laneCount = 1
  ) => {
    const bandPct = ROW_PCT / laneCount;
    const insetY = laneCount === 1 ? HL_INSET_Y : laneCount === 2 ? 3 : 2;
    return {
      top: `calc(${s.row * ROW_PCT + lane * bandPct}% + ${insetY}px)`,
      height: `calc(${bandPct}% - ${insetY * 2}px)`,
      left: `${s.leftPercent}%`,
      width: `${s.widthPercent}%`,
    };
  };

  const move = (delta: number) => {
    const d = new Date(year, month, day + delta);
    onChangeDay(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const addTask = (text: string, priority: Priority) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setData((p) => ({ ...p, tasks: [...p.tasks, { id: uid(), text: trimmed, done: false, priority }] }));
  };
  const toggleTask = (id: string) =>
    setData((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
  const removeTask = (id: string) =>
    setData((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== id) }));

  const addBlock = (title: string, start: number, end: number, color: string) => {
    const nb: Block = { id: uid(), title, start, end, color };
    setData((p) => ({ ...p, blocks: [...p.blocks, nb].sort((a, b) => a.start - b.start) }));
  };
  const removeBlock = async (id: string) => {
    const target = data.blocks.find((b) => b.id === id);
    setData((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== id) }));
    if (target?.googleEventId && hasGoogleConfig() && gSignedIn) {
      try {
        await deleteEvent(target.googleEventId);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_SIGNED_IN") onGSignedInChange(false);
        // 구글 쪽 삭제가 실패해도 로컬은 이미 지워졌으므로 조용히 넘어감
      }
    }
  };

  /** 시간표에 표시된 구글 일정을 직접 삭제 (앱이 만든 반복 일정 인스턴스는 이 버튼 자체가 안 뜸 — 반복 관리에서 삭제) */
  const removeGoogleEvent = (ev: GEvent) => {
    if (!hasGoogleConfig() || !gSignedIn) return;
    setPendingGDelete(ev); // 실제 삭제는 앱 스타일 확인 모달에서 "삭제"를 눌렀을 때
  };

  const confirmRemoveGoogleEvent = async (ev: GEvent) => {
    if (!hasGoogleConfig() || !gSignedIn) return;
    try {
      await deleteEvent(ev.id);
      setGEvents((prev) => prev.filter((e) => e.id !== ev.id));
    } catch (e) {
      if (e instanceof Error && e.message === "NOT_SIGNED_IN") {
        onGSignedInChange(false);
        setGMsg("다시 연결해줘");
      } else {
        setGMsg("구글 일정 삭제에 실패했어");
      }
    }
  };

  // 오늘 해당하는 습관 (요일 매칭). habitTick(체크 시)·habitsVersion(습관 목록 변경 시)에 따라 다시 계산됨
  const todaysHabits = habitsForDate(key, dow);
  const toggleHabit = (habitId: string) => {
    setHabitDone(key, habitId, !isHabitDone(key, habitId));
    setHabitTick((v) => v + 1);
  };

  const doneCount = data.tasks.filter((t) => t.done).length;
  const progress = data.tasks.length ? Math.round((doneCount / data.tasks.length) * 100) : 0;

  // 상단 오늘 요약카드(App)로 완료율 전달 — 이 날짜의 할 일이 바뀔 때마다 갱신
  useEffect(() => {
    onTasksProgressChange?.(doneCount, data.tasks.length);
  }, [doneCount, data.tasks.length]);

  const inputStyle = { background: P.paper, border: `1px solid ${P.line}` };

  // ---------- 구글 일정 분류: 종일 vs 시간대 ----------
  // 앱에서 내보낸 이벤트는, 대응하는 로컬 블록이 실제로 있을 때만 숨긴다
  // (다른 기기/초기화된 기기에는 로컬 블록이 없으므로 그대로 표시)
  const relevantGEvents = gEvents.filter((ev) => {
    const priv = ev.extendedProperties?.private;
    if (priv?.plannerSource === "daily-planner") {
      const plannerId = priv?.plannerId;
      const hasLocalBlock = !!plannerId && data.blocks.some((b) => b.id === plannerId);
      return !hasLocalBlock;
    }
    if (priv?.plannerSource === "daily-planner-recurring") {
      // 반복 일정은 singleEvents=true 조회 시 그날의 낱개 인스턴스로 펼쳐져 내려오는데,
      // 로컬 recurringForDay가 이미 같은 일정을 표시하므로 여기서 또 표시하면 중복이 됨.
      // 로컬에 대응하는 반복 일정이 남아있을 때만 숨기고(정상 케이스), 없으면(다른 기기 등) 그대로 보여준다.
      const recurringId = priv?.plannerRecurringId;
      const hasLocalRecurring = !!recurringId && loadRecurring().some((r) => r.id === recurringId);
      return !hasLocalRecurring;
    }
    return true;
  });
  const allDayGEvents = relevantGEvents.filter(isAllDayEvent);
  console.log(`[DEBUG][DayView] key=${key} gEvents=${gEvents.length} relevant=${relevantGEvents.length} allDay=${allDayGEvents.length}`, {
    gEvents: gEvents.map((ev) => ({ summary: ev.summary, start: ev.start, end: ev.end, calendarId: ev.calendarId })),
    allDayGEvents: allDayGEvents.map((ev) => ({ summary: ev.summary, start: ev.start, end: ev.end })),
  });
  const timedGEvents = relevantGEvents
    .filter((ev) => !isAllDayEvent(ev))
    .map((ev) => ({ ev, minutes: eventToMinutes(ev) }))
    .filter((x): x is { ev: GEvent; minutes: { start: number; end: number } } => x.minutes !== null);

  // ---------- 겹침 레인 배치: 앱 블록 + 반복 일정 + 구글 일정을 모두 함께 계산 ----------
  const recurringList = recurringForDay(dow, key);
  const laneMap: Map<string, LaneAssignment> = assignLanes([
    ...recurringList.map((b) => ({ key: `rec:${b.id}`, start: b.start, end: b.end })),
    ...data.blocks.map((b) => ({ key: `blk:${b.id}`, start: b.start, end: b.end })),
    ...timedGEvents.map(({ ev, minutes }) => ({ key: `g:${eventUid(ev)}`, start: minutes.start, end: minutes.end })),
  ]);
  const laneFor = (key: string): LaneAssignment => laneMap.get(key) ?? { lane: 0, count: 1 };

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
            <span style={{ color: dow === 0 ? P.red : dow === 6 ? P.blue : P.green }}>
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

      {/* 오늘의 습관 — 등록된 습관이 없으면 섹션 자체를 숨김 */}
      {todaysHabits.length > 0 && (
        <section className="card mb-3 sm:mb-6">
          <h2 className="text-base font-bold mb-3" style={{ fontFamily: "'Gowun Batang', serif" }}>
            오늘의 습관
          </h2>
          <ul className="flex flex-col gap-1.5">
            {todaysHabits.map((h) => {
              const done = isHabitDone(key, h.id);
              const streak = getStreak(h.id, key);
              return (
                <li key={h.id} className="flex items-center gap-2 px-2 py-2 rounded-lg"
                  style={{ background: done ? "transparent" : P.paper }}>
                  <button onClick={() => toggleHabit(h.id)}
                    aria-label={done ? "완료 취소" : "완료 표시"}
                    className="w-5 h-5 rounded shrink-0 flex items-center justify-center text-xs font-bold"
                    style={{
                      border: `2px solid ${done ? (h.color ?? P.green) : P.sage}`,
                      background: done ? (h.color ?? P.green) : "transparent",
                      color: "#fff",
                    }}>
                    {done ? "✓" : ""}
                  </button>
                  <span className="text-base leading-none shrink-0">{h.emoji}</span>
                  <span className="flex-1 text-sm" style={{ color: done ? P.faint : P.ink }}>
                    {h.name}
                  </span>
                  {streak > 0 && (
                    <span className="text-xs font-semibold shrink-0" style={{ color: h.color ?? P.green }}>
                      🔥{streak}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid md:grid-cols-5 gap-6">
        {/* 시간표 — 오른쪽 할 일/메모보다 넓게 배치 */}
        <section className="card md:col-span-3">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="text-lg font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>시간표</h2>
            <div className="flex items-center gap-2 shrink-0">
              <GhostButton icon="+" label="추가" onClick={() => setShowBlockForm(true)} title="일정 추가" />
              <GhostButton icon="🔁" label="반복" onClick={onOpenRecurring} title="매주 반복되는 고정 일정 관리" />
              {hasGoogleConfig() && gSignedIn && (
                <button onClick={exportDayToGoogle} disabled={gBusy}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium text-white"
                  style={{ background: P.green }}>
                  구글로 보내기
                </button>
              )}
            </div>
          </div>
          {gMsg && (
            <p className="text-[11px] mb-2" style={{ color: P.faint }}>{gMsg}</p>
          )}

          <div className="rounded-lg" style={{ border: `1px solid ${P.line}`, overflowX: "auto" }}>
            <div style={{ minWidth: MIN_TIMETABLE_W }}>
              {/* 종일 일정 행 — 구글 종일 이벤트가 있을 때만 표시, 격자 칸을 차지하지 않음 */}
              {allDayGEvents.length > 0 && (
                <div className="flex" style={{ borderBottom: `1.5px solid ${HOUR_LINE}` }}>
                  <div
                    className="shrink-0 flex items-center justify-center text-[10px]"
                    style={{ width: LABEL_W, borderRight: `1.5px solid ${HOUR_LINE}`, color: P.faint }}>
                    종일
                  </div>
                  <div className="flex-1 flex flex-wrap items-center gap-1 p-1">
                    {allDayGEvents.map((ev) => (
                      <span key={eventUid(ev)} title={ev.summary || "(제목 없음)"}
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
                        style={{ background: "#4285F42E", color: "#4285F4", border: "1px solid #4285F4" }}>
                        {ev.summary || "(제목 없음)"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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

                  {/* 반복 일정 (요일 기반, 읽기 전용) — 안 겹치면 행 전체, 겹치면 레인만큼 세로 분할 */}
                  {recurringList.map((b) => {
                    const segs = computeSegments(b.start, b.end);
                    if (segs.length === 0) return null;
                    const { lane, count } = laneFor(`rec:${b.id}`);
                    const primary = segs.reduce((a, s) => (s.widthPercent > a.widthPercent ? s : a), segs[0]);
                    return segs.map((s, si) => (
                      <div key={`${b.id}-${si}`}
                        className="absolute px-1 group overflow-hidden"
                        title={`${b.title} · ${minutesToLabel(b.start)}–${minutesToLabel(b.end)}`}
                        style={{
                          ...segStyle(s, lane, count),
                          background: `color-mix(in srgb, ${b.color ?? P.green} 13%, transparent)`,
                          borderLeft: `2px dashed ${b.color ?? P.green}`,
                          borderRadius: 3,
                        }}>
                        <div className="flex justify-between items-center h-full gap-1">
                          {s === primary && (
                            <span className={`${count > 2 ? "text-[8px]" : "text-[9px]"} font-semibold whitespace-nowrap`}
                              style={{ color: b.color ?? P.green }}>
                              ↻ {b.title}
                            </span>
                          )}
                          {s === primary && (
                            <button onClick={() => onStartFocus(b.title)}
                              className="text-[9px] px-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-auto"
                              style={{ color: P.green }} aria-label="집중 시작" title="이 일정으로 집중 타이머 시작">▶</button>
                          )}
                        </div>
                      </div>
                    ));
                  })}

                  {/* 앱 시간표 블록 — 안 겹치면 행 전체, 겹치면 레인만큼 세로 분할 */}
                  {data.blocks.map((b) => {
                    const segs = computeSegments(b.start, b.end);
                    if (segs.length === 0) return null;
                    const { lane, count } = laneFor(`blk:${b.id}`);
                    const primary = segs.reduce((a, s) => (s.widthPercent > a.widthPercent ? s : a), segs[0]);
                    return segs.map((s, si) => (
                      <div key={`${b.id}-${si}`}
                        className="absolute px-1 group overflow-hidden"
                        title={`${b.title} · ${minutesToLabel(b.start)}–${minutesToLabel(b.end)}`}
                        style={{
                          ...segStyle(s, lane, count),
                          background: `color-mix(in srgb, ${b.color ?? P.sage} 27%, transparent)`,
                          borderLeft: `3px solid ${b.color ?? P.green}`,
                          borderRadius: 3,
                        }}>
                        <div className="flex justify-between items-center h-full gap-1">
                          {s === primary && (
                            <span className={`${count > 2 ? "text-[8px]" : "text-[9px]"} font-semibold whitespace-nowrap leading-none`}>
                              {b.title}
                            </span>
                          )}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-auto">
                            {s === primary && (
                              <button onClick={() => onStartFocus(b.title)}
                                className="text-[9px] px-0.5"
                                style={{ color: P.green }} aria-label="집중 시작" title="이 일정으로 집중 타이머 시작">▶</button>
                            )}
                            <button onClick={() => removeBlock(b.id)}
                              className="text-[9px] px-0.5"
                              style={{ color: P.faint }} aria-label="일정 삭제">✕</button>
                          </div>
                        </div>
                      </div>
                    ));
                  })}

                  {/* 구글 캘린더 일정 (앱이 이 시간표에서 내보낸 이벤트는 중복 표시하지 않음, 종일 일정은 위 "종일" 행에서 표시)
                      안 겹치면 행 전체를 꽉 채우고, 겹치면(앱 블록끼리든, 구글끼리든, 혼합이든) 레인만큼 세로 분할 */}
                  {timedGEvents.map(({ ev, minutes }) => {
                    const segs = computeSegments(minutes.start, minutes.end);
                    if (segs.length === 0) return null;
                    const { lane, count } = laneFor(`g:${eventUid(ev)}`);
                    const primary = segs.reduce((a, s) => (s.widthPercent > a.widthPercent ? s : a), segs[0]);
                    const title = ev.summary || "(제목 없음)";
                    // 앱이 만든 반복 일정에서 펼쳐진 인스턴스는 개별 삭제 시 "이 날만/전체" 문제가 생기므로
                    // 삭제 버튼을 달지 않는다 — 반복 일정은 "반복" 관리 모달에서 통째로 삭제하도록 안내
                    const isRecurringInstance = ev.extendedProperties?.private?.plannerSource === "daily-planner-recurring";
                    return segs.map((s, si) => (
                      <div key={`${eventUid(ev)}-${si}`}
                        className="absolute px-1 group overflow-hidden"
                        title={`${title} · ${minutesToLabel(minutes.start)}–${minutesToLabel(minutes.end)}`}
                        style={{
                          ...segStyle(s, lane, count),
                          background: "#4285F41A",
                          borderLeft: "2px solid #4285F4",
                          borderRadius: 3,
                        }}>
                        <div className="flex justify-between items-center h-full gap-1">
                          {s === primary && (
                            <span className={`${count > 2 ? "text-[7px]" : "text-[8px]"} font-semibold whitespace-nowrap leading-none`}
                              style={{ color: "#4285F4" }}>
                              G {title}
                            </span>
                          )}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-auto">
                            {s === primary && (
                              <button onClick={() => onStartFocus(title)}
                                className="text-[9px] px-0.5"
                                style={{ color: P.green }} aria-label="집중 시작" title="이 일정으로 집중 타이머 시작">▶</button>
                            )}
                            {s === primary && !isRecurringInstance && (
                              <button onClick={() => removeGoogleEvent(ev)}
                                className="text-[9px] px-0.5"
                                style={{ color: P.faint }} aria-label="구글 일정 삭제" title="구글 캘린더에서 삭제">✕</button>
                            )}
                          </div>
                        </div>
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
          <section className="card relative">
            {data.tasks.length > 0 && progress === 100 && (
              <div className="stamp" aria-hidden="true">
                <span>참 잘했어요</span>
              </div>
            )}
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="text-base font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>
                할 일 <span className="text-xs font-normal" style={{ color: P.faint }}>({doneCount}/{data.tasks.length})</span>
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                <GhostButton icon="☰" label="전체" onClick={onOpenTodos} title="모든 날짜의 완료하지 않은 할 일 모아보기" />
                <GhostButton icon="+" label="추가" onClick={() => setShowTaskForm(true)} title="할 일 추가" />
              </div>
            </div>

            <ul className="flex flex-col gap-1">
              {data.tasks.length === 0 && (
                <li className="text-sm py-4 text-center" style={{ color: P.faint }}>
                  아직 할 일이 없어. "+ 추가"로 만들어봐.
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

          <section className="card">
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

      {showBlockForm && (
        <TimeBlockFormModal onClose={() => setShowBlockForm(false)} onAdd={addBlock} />
      )}
      {showTaskForm && (
        <TaskFormModal onClose={() => setShowTaskForm(false)} onAdd={addTask} />
      )}
      {pendingGDelete && (
        <ConfirmModal
          title="일정 삭제"
          message="이 일정을 삭제하면 구글 캘린더에서도 삭제됩니다."
          confirmLabel="삭제"
          cancelLabel="취소"
          danger
          onConfirm={() => confirmRemoveGoogleEvent(pendingGDelete)}
          onClose={() => setPendingGDelete(null)}
        />
      )}
    </div>
  );
}
