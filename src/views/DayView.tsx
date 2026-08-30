import { useEffect, useRef, useState } from "react";
import {
  Block, DayData, Task, HOURS, P, PRIORITIES, Priority,
  DAY_NAMES, dateKey, loadDay, saveDay, uid, recurringForDay, loadRecurring,
  minutesToLabel,
  TIMELINE_START_MIN, TIMELINE_END_MIN, minutesToRow, minutesToRowOffsetPercent, splitIntoRowSegments,
  assignLanes, LaneAssignment,
  habitsForDate, isHabitDone, setHabitDone, getStreak,
  getAutoSyncTimetable, setBlockGoogleEventId,
} from "../lib";
import {
  GEvent, hasGoogleConfig,
  listEventsForDate, createEvent, deleteEvent, eventToMinutes, findEventByPlannerId, isAllDayEvent, eventUid,
} from "../gcal";
import { pushTaskCreate, pushTaskDone, pushTaskDelete } from "../taskSync";
import GhostButton from "./GhostButton";
import TimeBlockFormModal from "./TimeBlockFormModal";
import TaskFormModal from "./TaskFormModal";
import ConfirmModal from "./ConfirmModal";
import TimetableActionModal from "./TimetableActionModal";

interface Props {
  year: number;
  month: number;
  day: number;
  recurringVersion: number; // 반복 일정 변경 시 리렌더 트리거
  habitsVersion: number; // 습관 목록 변경 시 리렌더 트리거
  tasksVersion: number; // 구글 Tasks 역동기화로 로컬 할 일이 바뀌면 리렌더 트리거
  gSignedIn: boolean; // 구글 캘린더 연결 상태 (상단바와 공유)
  onGSignedInChange: (v: boolean) => void;
  onBack: () => void;
  onChangeDay: (y: number, m: number, d: number) => void;
  onStartFocus: (title: string, durationMin?: number) => void;
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

/** 격자 영역 내 화면좌표(clientX/Y)를 자정 기준 분으로 변환.
 *  세로 = 시(hour) 행(HOURS[0]=06시부터 HOURS.length행), 가로 = 그 시(hour) 내 0~60분.
 *  격자 밖으로 나간 좌표는 가장자리로 clamp. 격자 크기를 못 재면 NaN. */
function pointToMinutes(el: HTMLElement, cx: number, cy: number): number {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return NaN;
  const x = Math.min(Math.max(cx - r.left, 0), r.width);
  const y = Math.min(Math.max(cy - r.top, 0), r.height);
  let row = Math.floor((y / r.height) * HOURS.length);
  row = Math.min(Math.max(row, 0), HOURS.length - 1);
  const hour = HOURS[0] + row;
  const minInHour = Math.min((x / r.width) * 60, 59.999);
  return hour * 60 + minInHour;
}

/** 드래그 앵커~현재 지점의 두 분값을 10분 격자에 스냅해 [start,end)로 정규화.
 *  최소 10분(칸 하나)을 보장하고 타임라인 범위(06:00~24:00)로 clamp. */
function normalizeSel(a: number, b: number): { start: number; end: number } {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let start = Math.floor(lo / 10) * 10;
  let end = Math.ceil(hi / 10) * 10;
  if (end - start < 10) end = start + 10;
  if (start < TIMELINE_START_MIN) start = TIMELINE_START_MIN;
  if (end > TIMELINE_END_MIN) end = TIMELINE_END_MIN;
  if (end - start < 10) start = end - 10;
  return { start, end };
}

export default function DayView({
  year, month, day, recurringVersion, habitsVersion, tasksVersion, gSignedIn, onGSignedInChange, onBack, onChangeDay, onStartFocus,
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

  // 시간표 일정 블록을 탭하면 뜨는 액션 시트(타이머/삭제) 대상
  const [tapAction, setTapAction] = useState<
    | { kind: "block"; id: string; title: string; start: number; end: number }
    | { kind: "google"; ev: GEvent; title: string; start: number; end: number }
    | { kind: "recurring"; title: string; start: number; end: number }
    | null
  >(null);

  // 날짜 바뀌거나 구글 Tasks 역동기화가 스토어를 갱신하면 다시 로드
  useEffect(() => setData(loadDay(key)), [key, tasksVersion]);

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
        // 이미 googleEventId가 있거나(자동 동기화로 생성됨) plannerId로 구글에서 찾아지면 중복 생성하지 않는다
        const already = findEventByPlannerId(existing, b.id);
        if (b.googleEventId || already) {
          idMap.set(b.id, b.googleEventId ?? already!.id);
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
    const nt: Task = { id: uid(), text: trimmed, done: false, priority };
    setData((p) => ({ ...p, tasks: [...p.tasks, nt] }));
    // 앱 → 구글: 생성 후 링크(googleTaskId)를 스토어에 저장하고, 같은 날짜를 보고 있으면 화면에도 반영
    void pushTaskCreate(key, nt).then(() => {
      const linked = loadDay(key).tasks.find((t) => t.id === nt.id);
      if (linked?.googleTaskId) {
        setData((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === nt.id
              ? { ...t, googleTaskId: linked.googleTaskId, googleTaskListId: linked.googleTaskListId }
              : t),
        }));
      }
    });
  };
  const toggleTask = (id: string) => {
    const target = data.tasks.find((t) => t.id === id);
    setData((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
    if (target) void pushTaskDone(target, !target.done);
  };
  const removeTask = (id: string) => {
    const target = data.tasks.find((t) => t.id === id);
    setData((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== id) }));
    if (target) void pushTaskDelete(target);
  };

  const addBlock = (title: string, start: number, end: number, color: string) => {
    const nb: Block = { id: uid(), title, start, end, color };
    setData((p) => ({ ...p, blocks: [...p.blocks, nb].sort((a, b) => a.start - b.start) }));

    // 자동 동기화 ON + 구글 로그인 시: 로컬 저장 직후 구글 캘린더에도 이벤트를 만들고
    // 받은 id를 블록에 연결한다 (D-Day 자동 생성과 동일한 패턴).
    if (getAutoSyncTimetable() && hasGoogleConfig() && gSignedIn) {
      void (async () => {
        try {
          const ev = await createEvent(key, title, start, end, nb.id);
          setBlockGoogleEventId(key, nb.id, ev.id);
          setData((p) => ({
            ...p,
            blocks: p.blocks.map((b) => (b.id === nb.id ? { ...b, googleEventId: ev.id } : b)),
          }));
        } catch (e) {
          if (e instanceof Error && e.message === "NOT_SIGNED_IN") onGSignedInChange(false);
          // 자동 동기화 실패해도 로컬에는 이미 저장됨 — 조용히 넘어감
        }
      })();
    }
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

  // ---------- 일정 블록 "탭" 감지 → 액션 시트 ----------
  // 빈 칸 = 롱프레스+드래그로 새 일정 추가(아래 gridRef useEffect). 일정 블록 = 짧은 탭으로 팝업.
  //
  // 폰(터치)에서 왜 안 됐나:
  //  - 블록은 격자(gridRef)의 자식 DOM이고, 격자에는 네이티브 touchstart/move/end 리스너가 붙어 있다.
  //  - 블록에 붙였던 React onTouch* 는 브라우저가 그 터치를 "스크롤/팬 제스처 후보"로 보는 순간
  //    touchcancel 로 바뀌거나 뒤따르는 click 이 취소돼서, 짧은 탭이 통째로 사라졌다
  //    (페이지 세로 스크롤 + 시간표 가로 overflow 스크롤이 겹쳐 브라우저가 특히 공격적으로 판단).
  //  - 데스크탑은 마우스라 제스처 판정이 없어 onClick 이 그대로 발동 → 됐던 것.
  // 해결: 블록 탭도 격자의 네이티브 리스너에서 같이 처리한다. data-tapkey → 콜백 레지스트리에
  //       등록해두고, 네이티브 touchend 에서 "블록 위에서 시작한 짧은 탭"이면 그 콜백을 부른다.
  const lastTapAt = useRef(0); // 터치 후 브라우저가 쏘는 유령 click 무시용
  const tapHandlersRef = useRef(new Map<string, () => void>());
  tapHandlersRef.current.clear(); // 렌더마다 최신 콜백으로 다시 채운다 (occupiedRef 와 같은 패턴)
  const registerTap = (tapKey: string, fn: () => void) => {
    tapHandlersRef.current.set(tapKey, fn);
    return {
      "data-tapkey": tapKey,
      onClick: () => {
        if (Date.now() - lastTapAt.current < 700) return; // 방금 터치 탭을 처리했으면 유령 클릭 무시
        fn();
      },
    };
  };

  // ---------- 시간표 빈 영역을 꾹 눌러 드래그 → 시간대 선택 → 일정 추가 ----------
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [dragSel, setDragSel] = useState<{ start: number; end: number } | null>(null); // 드래그 중 미리보기(형광펜)
  const [pendingSel, setPendingSel] = useState<{ start: number; end: number } | null>(null); // 손 뗀 뒤 모달에 넘길 확정 범위
  const dragSelRef = useRef<{ start: number; end: number } | null>(null);
  const setDrag = (v: { start: number; end: number } | null) => {
    dragSelRef.current = v;
    setDragSel(v);
  };
  const clearSelection = () => {
    setDrag(null);
    setPendingSel(null);
  };

  // 특정 분(min)이 이미 일정(앱 블록/반복/구글)에 점유돼 있는지 — 빈 영역에서만 드래그 시작을 허용하려고 사용.
  // 렌더마다 최신 데이터로 갱신해 네이티브 리스너 안에서도 최신값을 참조한다.
  const occupiedRef = useRef<(min: number) => boolean>(() => false);
  occupiedRef.current = (min) =>
    recurringList.some((b) => min >= b.start && min < b.end) ||
    data.blocks.some((b) => min >= b.start && min < b.end) ||
    timedGEvents.some(({ minutes }) => min >= minutes.start && min < minutes.end);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    // 진행 중인 드래그 상태 (터치). active=false 동안은 롱프레스 대기(움직이면 스크롤로 간주)
    let d: { anchor: number; active: boolean; timer: number; startX: number; startY: number } | null = null;
    // 블록(일정) 위에서 시작한 터치 — 격자 드래그와 별개로, 짧게 떼면 그 블록의 탭 콜백 실행
    let bt: { key: string; x: number; y: number; t: number } | null = null;
    const clearTimer = () => {
      if (d && d.timer) {
        window.clearTimeout(d.timer);
        d.timer = 0;
      }
    };
    const finish = () => {
      if (!d) return;
      clearTimer();
      const wasActive = d.active;
      d = null;
      if (wasActive && dragSelRef.current) setPendingSel(dragSelRef.current);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      // 1) 일정 블록 위에서 시작했나? → 탭 후보로 기록하고, 격자 드래그는 시작하지 않는다
      const tapEl = (e.target as HTMLElement | null)?.closest?.("[data-tapkey]") as HTMLElement | null;
      if (tapEl?.dataset.tapkey) {
        bt = { key: tapEl.dataset.tapkey, x: t.clientX, y: t.clientY, t: Date.now() };
        return;
      }
      // 2) 빈 영역 → 롱프레스 후 드래그로 새 일정 선택
      if (d) return;
      const min = pointToMinutes(el, t.clientX, t.clientY);
      if (Number.isNaN(min) || occupiedRef.current(min)) return; // 빈 영역에서만 시작
      d = { anchor: min, active: false, timer: 0, startX: t.clientX, startY: t.clientY };
      d.timer = window.setTimeout(() => {
        if (!d) return;
        d.active = true;
        setDrag(normalizeSel(d.anchor, d.anchor));
        navigator.vibrate?.(12);
      }, 300);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (bt) {
        // 10px 넘게 움직이면 스와이프(스크롤)로 간주 → 탭 취소. preventDefault 안 하므로 스크롤은 그대로 진행
        const p = e.touches[0];
        if (Math.abs(p.clientX - bt.x) > 10 || Math.abs(p.clientY - bt.y) > 10) bt = null;
        return;
      }
      if (!d) return;
      const t = e.touches[0];
      if (!d.active) {
        // 롱프레스 완성 전에 움직이면 = 스크롤 의도 → 선택 취소하고 스크롤에 양보
        if (Math.abs(t.clientX - d.startX) > 8 || Math.abs(t.clientY - d.startY) > 8) {
          clearTimer();
          d = null;
        }
        return;
      }
      e.preventDefault(); // 선택 중에는 페이지 스크롤 차단
      const min = pointToMinutes(el, t.clientX, t.clientY);
      if (!Number.isNaN(min)) setDrag(normalizeSel(d.anchor, min));
    };

    // 마우스(보조) — 롱프레스 없이 6px 이상 드래그하면 선택 시작
    const onMouseDown = (e: MouseEvent) => {
      if (d || e.button !== 0) return;
      const min = pointToMinutes(el, e.clientX, e.clientY);
      if (Number.isNaN(min) || occupiedRef.current(min)) return;
      const anchor = min;
      let engaged = false;
      const mm = (ev: MouseEvent) => {
        if (!engaged) {
          if (Math.abs(ev.clientX - e.clientX) <= 6 && Math.abs(ev.clientY - e.clientY) <= 6) return;
          engaged = true;
        }
        const m2 = pointToMinutes(el, ev.clientX, ev.clientY);
        if (!Number.isNaN(m2)) setDrag(normalizeSel(anchor, m2));
      };
      const mu = () => {
        document.removeEventListener("mousemove", mm);
        document.removeEventListener("mouseup", mu);
        if (engaged && dragSelRef.current) setPendingSel(dragSelRef.current);
      };
      document.addEventListener("mousemove", mm);
      document.addEventListener("mouseup", mu);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (bt) {
        const fn = tapHandlersRef.current.get(bt.key);
        const quick = Date.now() - bt.t < 1000; // 1초 이내면 탭으로 인정 (약간 길게 눌러도 통과)
        bt = null;
        if (quick && fn) {
          e.preventDefault(); // 뒤따르는 유령 click(모달 오버레이를 눌러 바로 닫아버림) 차단
          lastTapAt.current = Date.now();
          fn();
        }
      }
      finish();
    };
    const onTouchCancel = () => {
      bt = null;
      finish();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    el.addEventListener("touchcancel", onTouchCancel);
    el.addEventListener("mousedown", onMouseDown);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
      el.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

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
              {/* 자동 동기화가 켜져 있으면 추가/삭제 시 이미 구글에 반영되므로 버튼 불필요 — OFF(수동 모드)일 때만 노출 */}
              {hasGoogleConfig() && gSignedIn && !getAutoSyncTimetable() && (
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

                <div ref={gridRef} className="relative flex-1" style={{ aspectRatio: `6 / ${GRID_ASPECT_ROWS}` }}>
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

                  {/* 드래그로 선택 중인 시간대 (형광펜 미리보기) */}
                  {dragSel && computeSegments(dragSel.start, dragSel.end).map((s, i) => (
                    <div key={`sel-${i}`} className="absolute pointer-events-none"
                      style={{
                        ...segStyle(s),
                        background: `color-mix(in srgb, ${P.sage} 45%, transparent)`,
                        border: `1.5px solid ${P.green}`,
                        borderRadius: 3,
                      }} />
                  ))}
                  {dragSel && (
                    <div className="absolute left-1 top-1 z-10 text-[10px] font-bold px-1.5 py-0.5 rounded text-white pointer-events-none"
                      style={{ background: P.green }}>
                      {minutesToLabel(dragSel.start)} ~ {minutesToLabel(dragSel.end)}
                    </div>
                  )}

                  {/* 반복 일정 (요일 기반, 읽기 전용) — 안 겹치면 행 전체, 겹치면 레인만큼 세로 분할 */}
                  {recurringList.map((b) => {
                    const segs = computeSegments(b.start, b.end);
                    if (segs.length === 0) return null;
                    const { lane, count } = laneFor(`rec:${b.id}`);
                    const primary = segs.reduce((a, s) => (s.widthPercent > a.widthPercent ? s : a), segs[0]);
                    return segs.map((s, si) => (
                      <div key={`${b.id}-${si}`}
                        className="absolute px-1 overflow-hidden cursor-pointer select-none touch-manipulation"
                        title={`${b.title} · ${minutesToLabel(b.start)}–${minutesToLabel(b.end)}`}
                        {...registerTap(`rec:${b.id}`, () => setTapAction({ kind: "recurring", title: b.title, start: b.start, end: b.end }))}
                        style={{
                          ...segStyle(s, lane, count),
                          background: `color-mix(in srgb, ${b.color ?? P.green} 13%, transparent)`,
                          borderLeft: `2px dashed ${b.color ?? P.green}`,
                          borderRadius: 3,
                        }}>
                        <div className="flex items-center h-full">
                          {s === primary && (
                            <span className={`${count > 2 ? "text-[8px]" : "text-[9px]"} font-semibold whitespace-nowrap`}
                              style={{ color: b.color ?? P.green }}>
                              ↻ {b.title}
                            </span>
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
                        className="absolute px-1 overflow-hidden cursor-pointer select-none touch-manipulation"
                        title={`${b.title} · ${minutesToLabel(b.start)}–${minutesToLabel(b.end)}`}
                        {...registerTap(`blk:${b.id}`, () => setTapAction({ kind: "block", id: b.id, title: b.title, start: b.start, end: b.end }))}
                        style={{
                          ...segStyle(s, lane, count),
                          background: `color-mix(in srgb, ${b.color ?? P.sage} 27%, transparent)`,
                          borderLeft: `3px solid ${b.color ?? P.green}`,
                          borderRadius: 3,
                        }}>
                        <div className="flex items-center h-full">
                          {s === primary && (
                            <span className={`${count > 2 ? "text-[8px]" : "text-[9px]"} font-semibold whitespace-nowrap leading-none`}>
                              {b.title}
                            </span>
                          )}
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
                        className="absolute px-1 overflow-hidden cursor-pointer select-none touch-manipulation"
                        title={`${title} · ${minutesToLabel(minutes.start)}–${minutesToLabel(minutes.end)}`}
                        {...registerTap(`g:${eventUid(ev)}`, () => setTapAction(
                          isRecurringInstance
                            ? { kind: "recurring", title, start: minutes.start, end: minutes.end }
                            : { kind: "google", ev, title, start: minutes.start, end: minutes.end }
                        ))}
                        style={{
                          ...segStyle(s, lane, count),
                          background: "#4285F41A",
                          borderLeft: "2px solid #4285F4",
                          borderRadius: 3,
                        }}>
                        <div className="flex items-center h-full">
                          {s === primary && (
                            <span className={`${count > 2 ? "text-[7px]" : "text-[8px]"} font-semibold whitespace-nowrap leading-none`}
                              style={{ color: "#4285F4" }}>
                              G {title}
                            </span>
                          )}
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
                    {t.googleTaskId && (
                      <span className="text-[9px] w-4 h-4 rounded-full font-bold shrink-0 flex items-center justify-center text-white"
                        style={{ background: "#4285F4" }} title="구글 할 일과 동기화됨">
                        G
                      </span>
                    )}
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
      {pendingSel && (
        <TimeBlockFormModal
          fixedStart={pendingSel.start}
          fixedEnd={pendingSel.end}
          onClose={clearSelection}
          onAdd={addBlock}
        />
      )}
      {showTaskForm && (
        <TaskFormModal onClose={() => setShowTaskForm(false)} onAdd={addTask} />
      )}
      {tapAction && (
        <TimetableActionModal
          title={tapAction.title}
          start={tapAction.start}
          end={tapAction.end}
          kind={tapAction.kind}
          onStartFocus={() => onStartFocus(tapAction.title, tapAction.end - tapAction.start)}
          onDelete={() => {
            if (tapAction.kind === "block") void removeBlock(tapAction.id);
            else if (tapAction.kind === "google") removeGoogleEvent(tapAction.ev);
          }}
          onClose={() => setTapAction(null)}
        />
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
