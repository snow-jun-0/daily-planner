// ---------- 타입 ----------
export type Priority = "high" | "mid" | "low";

export interface Task {
  id: string;
  text: string;
  done: boolean;
  priority: Priority;
}

export interface Block {
  id: string;
  title: string;
  start: number; // 자정 기준 분 단위 (06:00~24:00 → 360~1440)
  end: number; // 자정 기준 분 단위
  color?: string;
}

/** 반복 일정: 특정 요일마다 반복되는 고정 일정 (예: 매주 월/수 09-11 수업) */
export interface RecurringBlock {
  id: string;
  title: string;
  days: number[]; // 요일 0(일)~6(토), 여러 개 가능
  start: number; // 자정 기준 분 단위
  end: number; // 자정 기준 분 단위
  color?: string;
  startDate?: string; // "YYYY-MM-DD", 이 날짜부터 표시 (없으면 제한 없음)
  endDate?: string; // "YYYY-MM-DD", 이 날짜까지 표시 (없으면 제한 없음)
}

export interface DayData {
  tasks: Task[];
  blocks: Block[];
  memo: string;
}

export const EMPTY_DAY: DayData = { tasks: [], blocks: [], memo: "" };

export const PRIORITIES: { id: Priority; label: string; color: string; bg: string }[] = [
  { id: "high", label: "중요", color: "var(--pri-high)", bg: "var(--tint-red)" },
  { id: "mid", label: "보통", color: "var(--pri-mid)", bg: "var(--tint-green)" },
  { id: "low", label: "여유", color: "var(--pri-low)", bg: "var(--tint-gray)" },
];

export const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06~23 (그리드 눈금용)

// ---------- 시간(분 단위) 유틸 ----------
export const TIMELINE_START_MIN = 360; // 06:00
export const TIMELINE_END_MIN = 1440; // 24:00
export const TIMELINE_SPAN_MIN = TIMELINE_END_MIN - TIMELINE_START_MIN;
const MIN_STEP = 10;

/** 06:00~24:00, 10분 간격 옵션 (분 단위 총합) */
export const MINUTE_OPTIONS = Array.from(
  { length: TIMELINE_SPAN_MIN / MIN_STEP + 1 },
  (_, i) => TIMELINE_START_MIN + i * MIN_STEP
);
/** 시작 시간 옵션 (23:50까지, 24:00 시작은 불가) */
export const START_MINUTE_OPTIONS = MINUTE_OPTIONS.filter((m) => m < TIMELINE_END_MIN);

export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 타임라인 상 위치(%) 계산 (세로 레이아웃용, 현재 미사용이지만 호환을 위해 유지) */
export function minutesToPercent(min: number): number {
  return ((min - TIMELINE_START_MIN) / TIMELINE_SPAN_MIN) * 100;
}

/** 가로 격자에서 몇 번째 시(hour) 행인지 (0부터, HOURS[0]=06시 기준) */
export function minutesToRow(min: number): number {
  return Math.floor(min / 60) - Math.floor(TIMELINE_START_MIN / 60);
}

/** 가로 격자에서 해당 행 내 좌우 위치(%, 0~100 = 정시~다음 정시) */
export function minutesToRowOffsetPercent(min: number): number {
  return ((((min % 60) + 60) % 60) / 60) * 100;
}

/** 블록의 [start,end)를 시(hour) 행 단위로 잘라, 각 행에서 차지하는 좌우 구간(%)을 반환 */
export function splitIntoRowSegments(
  start: number,
  end: number
): { row: number; leftPercent: number; widthPercent: number }[] {
  const segments: { row: number; leftPercent: number; widthPercent: number }[] = [];
  const firstHour = Math.floor(start / 60);
  const lastHour = Math.floor((end - 1) / 60); // end는 배타적 경계
  for (let h = firstHour; h <= lastHour; h++) {
    const rowStartMin = h * 60;
    const rowEndMin = rowStartMin + 60;
    const segStart = Math.max(start, rowStartMin);
    const segEnd = Math.min(end, rowEndMin);
    if (segEnd <= segStart) continue;
    segments.push({
      row: minutesToRow(rowStartMin),
      leftPercent: minutesToRowOffsetPercent(segStart),
      widthPercent: ((segEnd - segStart) / 60) * 100,
    });
  }
  return segments;
}

/** 겹침 레인 배치 대상 아이템 (앱 블록/반복 일정/구글 일정 공통) */
export interface LaneItem {
  key: string;
  start: number;
  end: number;
}

export interface LaneAssignment {
  lane: number; // 0부터 시작하는 세로 위치(레인) 인덱스
  count: number; // 이 아이템이 속한 겹침 그룹의 전체 레인 수
}

/**
 * 시간대가 겹치는 아이템들을 그룹으로 묶고, 그룹 내 개수만큼 세로 레인을 나눠 할당한다.
 * (구글 캘린더처럼 겹치는 것끼리만 나란히 보이고, 안 겹치면 그대로 전체 높이를 씀)
 * 연쇄적으로 겹치는 아이템(A-B 겹침, B-C 겹침)은 A-C가 직접 안 겹쳐도 같은 그룹으로 묶인다.
 */
export function assignLanes(items: LaneItem[]): Map<string, LaneAssignment> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end || a.key.localeCompare(b.key));
  const result = new Map<string, LaneAssignment>();

  let group: LaneItem[] = [];
  let groupEnd = -Infinity;

  const flush = () => {
    group.forEach((it, idx) => result.set(it.key, { lane: idx, count: group.length }));
    group = [];
  };

  for (const it of sorted) {
    if (group.length > 0 && it.start >= groupEnd) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  flush();

  return result;
}

/** 기존 데이터(정수 시, 6~24)를 분 단위로 마이그레이션. 이미 분 단위(360 이상)면 그대로 둠 */
function migrateMinutes(v: number): number {
  return v <= 24 ? v * 60 : v;
}

function migrateBlock<T extends { start: number; end: number }>(b: T): T {
  return { ...b, start: migrateMinutes(b.start), end: migrateMinutes(b.end) };
}

// ---------- 시간표 블록 색상 (형광펜 팔레트) ----------
export const BLOCK_COLORS = [
  { name: "노랑", color: "#F7E017" },
  { name: "초록", color: "#8FE04F" },
  { name: "파랑", color: "#5DADE2" },
  { name: "분홍", color: "#FF8FB1" },
  { name: "보라", color: "#C79EF2" },
  { name: "주황", color: "#FFB05C" },
];

export const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- 날짜 유틸 ----------
export const dateKey = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
export const MONTH_NAMES = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

// ---------- 저장소 (localStorage) ----------
const STORE_KEY = "daily-planner-v1";

type Store = Record<string, DayData>; // dateKey -> DayData

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function saveStore(store: Store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

export function loadDay(key: string): DayData {
  const store = loadStore();
  const raw = store[key] ?? { ...EMPTY_DAY };
  return { ...raw, blocks: raw.blocks.map(migrateBlock) };
}

export function saveDay(key: string, data: DayData) {
  const store = loadStore();
  const isEmpty =
    data.tasks.length === 0 && data.blocks.length === 0 &&
    data.memo.trim() === "";
  if (isEmpty) delete store[key];
  else store[key] = data;
  saveStore(store);
}

/** 모든 날짜에 걸친 미완료 할 일을 날짜 오름차순으로 반환 */
export function allIncompleteTasks(): { date: string; task: Task }[] {
  const store = loadStore();
  const result: { date: string; task: Task }[] = [];
  for (const k of Object.keys(store).sort()) {
    for (const t of store[k].tasks) {
      if (!t.done) result.push({ date: k, task: t });
    }
  }
  return result;
}

/** 모든 날짜의 할 일을 날짜 오름차순으로 반환 (전체 할 일 모아보기용, 완료 포함) */
export function allTasks(): { date: string; task: Task }[] {
  const store = loadStore();
  const result: { date: string; task: Task }[] = [];
  for (const k of Object.keys(store).sort()) {
    for (const t of store[k].tasks) {
      result.push({ date: k, task: t });
    }
  }
  return result;
}

/** 특정 날짜의 할 일을 완료 처리 */
export function markTaskDone(key: string, taskId: string) {
  const day = loadDay(key);
  saveDay(key, { ...day, tasks: day.tasks.map((t) => (t.id === taskId ? { ...t, done: true } : t)) });
}

/** 특정 날짜의 할 일 완료 여부를 명시적으로 설정 (전체 할 일 화면에서 토글용) */
export function setTaskDone(key: string, taskId: string, done: boolean) {
  const day = loadDay(key);
  saveDay(key, { ...day, tasks: day.tasks.map((t) => (t.id === taskId ? { ...t, done } : t)) });
}

/** 메모가 있는 모든 날짜를 날짜 오름차순으로 반환 (메모 전체보기용) */
export function allMemos(): { date: string; memo: string }[] {
  const store = loadStore();
  const result: { date: string; memo: string }[] = [];
  for (const k of Object.keys(store).sort()) {
    const memo = store[k].memo;
    if (memo && memo.trim() !== "") result.push({ date: k, memo });
  }
  return result;
}

// ---------- 반복 일정 저장소 ----------
const RECUR_KEY = "daily-planner-recurring-v1";

export function loadRecurring(): RecurringBlock[] {
  try {
    const raw = localStorage.getItem(RECUR_KEY);
    const list = raw ? (JSON.parse(raw) as RecurringBlock[]) : [];
    return list.map(migrateBlock);
  } catch {
    return [];
  }
}

export function saveRecurring(list: RecurringBlock[]) {
  localStorage.setItem(RECUR_KEY, JSON.stringify(list));
}

/** 특정 요일/날짜에 해당하는 반복 일정을 Block 형태로 반환 (시간표에 얹기 위함) */
export function recurringForDay(dow: number, dateStr: string): (Block & { recurring: true; color?: string })[] {
  return loadRecurring()
    .filter((r) => r.days.includes(dow))
    .filter((r) => (!r.startDate || dateStr >= r.startDate) && (!r.endDate || dateStr <= r.endDate))
    .map((r) => ({ id: `recur-${r.id}`, title: r.title, start: r.start, end: r.end, recurring: true as const, color: r.color }));
}

// ---------- JSON 백업/복원 ----------
export function downloadJSON() {
  const blob = new Blob([JSON.stringify(loadStore(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 백업 JSON을 현재 데이터에 병합. 같은 날짜는 파일 쪽으로 덮어씀 */
export function importJSON(text: string): number {
  const incoming = JSON.parse(text) as Store;
  if (typeof incoming !== "object" || incoming === null) throw new Error("형식이 올바르지 않아");
  const store = loadStore();
  let count = 0;
  for (const [k, v] of Object.entries(incoming)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && Array.isArray(v.tasks)) {
      store[k] = v;
      count++;
    }
  }
  saveStore(store);
  return count;
}

/** 이 앱이 쓰는 모든 localStorage 데이터를 삭제 (키 접두사 "daily-planner"로 식별) */
export function resetAllData() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith("daily-planner"))
    .forEach((k) => localStorage.removeItem(k));
}

// ---------- 클라우드 동기화 (Supabase REST) ----------
export interface SyncConfig {
  url: string; // https://xxxx.supabase.co
  key: string; // anon public key
  code: string; // 동기화 코드 (기기들이 같은 코드를 쓰면 같은 데이터)
}

const SYNC_KEY = "daily-planner-sync";

export function getSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function setSyncConfig(cfg: SyncConfig | null) {
  if (cfg) localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(SYNC_KEY);
}

function syncHeaders(cfg: SyncConfig) {
  return {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
  };
}

/** 이 기기 데이터를 클라우드로 업로드 (덮어씀) */
export async function pushToCloud(cfg: SyncConfig): Promise<void> {
  const res = await fetch(`${cfg.url}/rest/v1/planner?on_conflict=sync_id`, {
    method: "POST",
    headers: { ...syncHeaders(cfg), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      sync_id: cfg.code,
      data: loadStore(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`업로드 실패 (${res.status}): ${await res.text()}`);
}

/** 클라우드 데이터를 이 기기로 다운로드 (덮어씀). 데이터 없으면 false */
export async function pullFromCloud(cfg: SyncConfig): Promise<boolean> {
  const res = await fetch(
    `${cfg.url}/rest/v1/planner?sync_id=eq.${encodeURIComponent(cfg.code)}&select=data`,
    { headers: syncHeaders(cfg) }
  );
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status}): ${await res.text()}`);
  const rows = (await res.json()) as { data: Store }[];
  if (!rows.length) return false;
  saveStore(rows[0].data);
  return true;
}

/** 해당 월에 데이터가 있는 날짜(day 숫자) 집합 */
export function daysWithData(y: number, m: number): Set<number> {
  const store = loadStore();
  const prefix = `${y}-${String(m + 1).padStart(2, "0")}-`;
  const set = new Set<number>();
  for (const k of Object.keys(store)) {
    if (k.startsWith(prefix)) set.add(Number(k.slice(prefix.length)));
  }
  return set;
}

/** 월별 데이터 존재 여부 (연간 뷰 표시용) */
export function monthsWithData(y: number): Set<number> {
  const store = loadStore();
  const set = new Set<number>();
  for (const k of Object.keys(store)) {
    if (k.startsWith(`${y}-`)) set.add(Number(k.slice(5, 7)) - 1);
  }
  return set;
}

// ---------- ICS (캘린더 연동) ----------
function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** "YYYY-MM-DD" + 분(자정 기준, 1440 넘으면 다음날로 넘김)을 ICS 로컬시간 문자열로 변환 */
function icsDateTime(dateStr: string, min: number): string {
  const dayOffset = Math.floor(min / 1440);
  const mm = ((min % 1440) + 1440) % 1440;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + dayOffset);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const h = Math.floor(mm / 60);
  const m = mm % 60;
  return `${ymd}T${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
}

/** 저장된 모든 일정 블록 + 할 일을 .ics로 내보내기 */
export function exportICS(): string {
  const store = loadStore();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DailyPlanner//KO",
    "CALSCALE:GREGORIAN",
  ];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  for (const [key, rawDay] of Object.entries(store)) {
    const day = { ...rawDay, blocks: rawDay.blocks.map(migrateBlock) };
    for (const b of day.blocks) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${key}-${b.id}@daily-planner`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsDateTime(key, b.start)}`,
        `DTEND:${icsDateTime(key, b.end)}`,
        `SUMMARY:${icsEscape(b.title)}`,
        "END:VEVENT"
      );
    }
    const todoText = day.tasks.map((t) => `${t.done ? "✓" : "☐"} ${t.text}`).join("\n");
    if (todoText) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${key}-todos@daily-planner`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${key.replace(/-/g, "")}`,
        `SUMMARY:${icsEscape(`할 일 ${day.tasks.filter((t) => !t.done).length}건`)}`,
        `DESCRIPTION:${icsEscape(todoText)}`,
        "END:VEVENT"
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS() {
  const blob = new Blob([exportICS()], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "planner.ics";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- 습관 트래커 ----------
/** 매일(또는 지정 요일마다) 반복하는 습관. targetDays가 비어있으면 매일 습관 */
export interface Habit {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  targetDays?: number[]; // 요일 0(일)~6(토). 비어있거나 없으면 매일
  createdAt: string; // "YYYY-MM-DD" — 이 날짜 이전은 스트릭·달성률 계산에서 제외
}

export const HABIT_EMOJIS = ["💪", "💧", "📚", "🏃", "🧘", "😴", "🥗", "✍️", "🎯", "🚭", "🧹", "☀️"];

export const HABIT_COLORS = ["#2F6B4F", "#2C5AA0", "#C0392B", "#B8860B", "#7D3C98", "#0E7490"];

const HABIT_KEY = "daily-planner-habits-v1";

export function loadHabits(): Habit[] {
  try {
    const raw = localStorage.getItem(HABIT_KEY);
    return raw ? (JSON.parse(raw) as Habit[]) : [];
  } catch {
    return [];
  }
}

export function saveHabits(list: Habit[]) {
  localStorage.setItem(HABIT_KEY, JSON.stringify(list));
}

// ---------- 습관 완료 기록 (날짜별) ----------
const HABIT_LOG_KEY = "daily-planner-habit-log-v1";

type HabitLog = Record<string, Record<string, boolean>>; // dateKey -> habitId -> done

function loadHabitLog(): HabitLog {
  try {
    const raw = localStorage.getItem(HABIT_LOG_KEY);
    return raw ? (JSON.parse(raw) as HabitLog) : {};
  } catch {
    return {};
  }
}

function saveHabitLog(log: HabitLog) {
  localStorage.setItem(HABIT_LOG_KEY, JSON.stringify(log));
}

export function isHabitDone(dateStr: string, habitId: string): boolean {
  return !!loadHabitLog()[dateStr]?.[habitId];
}

export function setHabitDone(dateStr: string, habitId: string, done: boolean) {
  const log = loadHabitLog();
  if (done) {
    log[dateStr] = { ...(log[dateStr] ?? {}), [habitId]: true };
  } else if (log[dateStr]) {
    const rest = { ...log[dateStr] };
    delete rest[habitId];
    if (Object.keys(rest).length === 0) delete log[dateStr];
    else log[dateStr] = rest;
  }
  saveHabitLog(log);
}

/** 해당 요일에 습관이 적용되는지 (targetDays 없거나 비어있으면 매일 적용) */
function habitAppliesToDay(habit: Habit, dow: number): boolean {
  return !habit.targetDays || habit.targetDays.length === 0 || habit.targetDays.includes(dow);
}

/** 특정 날짜에 표시해야 할 습관 목록 (요일 매칭 + 습관 생성일 이후) */
export function habitsForDate(dateStr: string, dow: number): Habit[] {
  return loadHabits().filter((h) => (!h.createdAt || dateStr >= h.createdAt) && habitAppliesToDay(h, dow));
}

/** 해당 날짜에 적용되는 습관을 전부 완료했는지 (적용되는 습관이 하나도 없으면 false) */
export function allHabitsDoneForDate(dateStr: string, dow: number): boolean {
  const applicable = habitsForDate(dateStr, dow);
  if (applicable.length === 0) return false;
  const log = loadHabitLog();
  return applicable.every((h) => !!log[dateStr]?.[h.id]);
}

/**
 * 기준일(기본 오늘)부터 거꾸로 며칠 연속 완료했는지 계산.
 * targetDays가 있는 습관은 해당 요일만 카운트하고, 적용 안 되는 날은 건너뛴다(스트릭 안 끊김).
 * 기준일 자체가 아직 미완료여도(하루가 안 끝났으므로) 스트릭을 끊지 않고 그 전날부터 계산한다.
 */
export function getStreak(habitId: string, refDateStr?: string): number {
  const habit = loadHabits().find((h) => h.id === habitId);
  if (!habit) return 0;
  const log = loadHabitLog();

  const ref = refDateStr ? new Date(`${refDateStr}T00:00:00`) : new Date();
  ref.setHours(0, 0, 0, 0);
  const cursor = new Date(ref);

  let streak = 0;
  let isRefDay = true;
  for (let i = 0; i < 3650; i++) { // 최대 10년치까지만 순회 (안전장치)
    const ds = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    if (ds < habit.createdAt) break;
    if (habitAppliesToDay(habit, cursor.getDay())) {
      const done = !!log[ds]?.[habitId];
      if (done) streak++;
      else if (!isRefDay) break;
    }
    isRefDay = false;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function startOfMonth(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), 1);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** [start, end] 기간(포함) 중 습관이 적용되는 날 대비 완료한 비율(%) */
export function habitRateForRange(habitId: string, start: Date, end: Date): number {
  const habit = loadHabits().find((h) => h.id === habitId);
  if (!habit) return 0;
  const log = loadHabitLog();
  let total = 0;
  let done = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const ds = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    if ((!habit.createdAt || ds >= habit.createdAt) && habitAppliesToDay(habit, cursor.getDay())) {
      total++;
      if (log[ds]?.[habitId]) done++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return total ? Math.round((done / total) * 100) : 0;
}

/** 이번 주(일요일 시작)부터 오늘까지의 달성률(%) */
export function getWeekRate(habitId: string, ref: Date = new Date()): number {
  return habitRateForRange(habitId, startOfWeek(ref), ref);
}

/** 이번 달 1일부터 오늘까지의 달성률(%) */
export function getMonthRate(habitId: string, ref: Date = new Date()): number {
  return habitRateForRange(habitId, startOfMonth(ref), ref);
}

// ---------- D-Day ----------
export interface DDay {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  color: string;
  googleEventId?: string; // 구글 캘린더 종일 이벤트와 연결된 경우 (역동기화·삭제용)
}

export const DDAY_COLORS = ["#E8724C", "#F5B94A", "#7EC08A", "#7FB5D9", "#B98AD4"];

const DDAY_KEY = "daily-planner-ddays-v1";

/** 날짜 가까운 순(오늘 기준 D-day 오름차순 = 날짜 오름차순과 동일)으로 정렬해 반환 */
export function loadDDays(): DDay[] {
  try {
    const raw = localStorage.getItem(DDAY_KEY);
    const list = raw ? (JSON.parse(raw) as DDay[]) : [];
    return [...list].sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export function saveDDays(list: DDay[]) {
  localStorage.setItem(DDAY_KEY, JSON.stringify(list));
}

export function addDDay(dday: DDay) {
  saveDDays([...loadDDays(), dday]);
}

export function removeDDay(id: string) {
  saveDDays(loadDDays().filter((d) => d.id !== id));
}

/** 구글 이벤트 생성 완료 후 googleEventId를 로컬 D-Day에 채워 넣음 */
export function setDDayGoogleEventId(id: string, googleEventId: string) {
  saveDDays(loadDDays().map((d) => (d.id === id ? { ...d, googleEventId } : d)));
}

/** dateStr(오늘 기준) 까지 남은/지난 일수를 "D-N" / "D-DAY" / "D+N" 형태 문자열로 반환 */
export function getDDayCount(dateStr: string, refDateStr?: string): string {
  const ref = refDateStr ? new Date(`${refDateStr}T00:00:00`) : new Date();
  ref.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  const diffDays = Math.round((target.getTime() - ref.getTime()) / 86_400_000);
  if (diffDays === 0) return "D-DAY";
  return diffDays > 0 ? `D-${diffDays}` : `D+${-diffDays}`;
}

/** D-Day 날짜가 기준일(기본: 오늘)보다 이전이면 true — 오늘(D-DAY)은 아직 유효하므로 false */
export function isDDayPast(dateStr: string, refDateStr?: string): boolean {
  const ref = refDateStr ? new Date(`${refDateStr}T00:00:00`) : new Date();
  ref.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  const diffDays = Math.round((target.getTime() - ref.getTime()) / 86_400_000);
  return diffDays < 0;
}

/**
 * 화면 표시용 D-Day 목록 — 이미 지난(어제 이전) D-Day는 제외한다.
 * 저장된 데이터(로컬/구글)는 그대로 두고 표시 시점에만 필터링한다.
 */
export function loadVisibleDDays(refDateStr?: string): DDay[] {
  return loadDDays().filter((d) => !isDDayPast(d.date, refDateStr));
}

/** D-7 이내(오늘 포함, 미래만)인지 — 강조색 적용 여부 판단용 */
export function isDDaySoon(dateStr: string, refDateStr?: string): boolean {
  const ref = refDateStr ? new Date(`${refDateStr}T00:00:00`) : new Date();
  ref.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  const diffDays = Math.round((target.getTime() - ref.getTime()) / 86_400_000);
  return diffDays >= 0 && diffDays <= 7;
}

// ---------- 알림 설정 ----------
export type NotifyMode = "mute" | "vibrate" | "sound";
const NOTIFY_MODE_KEY = "daily-planner-notify-mode";
const NOTIFY_DAILY_KEY = "daily-planner-notify-daily";
const NOTIFY_DAILY_LAST_FIRED_KEY = "daily-planner-notify-daily-last-fired";

/** 뽀모도로 완료 등에 쓸 알림 방식. 기본값은 기존 동작(항상 소리)과 동일하게 "sound" */
export function getNotifyMode(): NotifyMode {
  const v = localStorage.getItem(NOTIFY_MODE_KEY);
  return v === "mute" || v === "vibrate" || v === "sound" ? v : "sound";
}

export function setNotifyMode(mode: NotifyMode) {
  localStorage.setItem(NOTIFY_MODE_KEY, mode);
}

export function getNotifyDaily(): boolean {
  return localStorage.getItem(NOTIFY_DAILY_KEY) === "1";
}

export function setNotifyDaily(v: boolean) {
  localStorage.setItem(NOTIFY_DAILY_KEY, v ? "1" : "0");
}

/** 저녁 회고 알림을 오늘 이미 보냈는지 (같은 날 중복 발송 방지) */
export function wasDailyReflectionFiredToday(todayKey: string): boolean {
  return localStorage.getItem(NOTIFY_DAILY_LAST_FIRED_KEY) === todayKey;
}

export function markDailyReflectionFired(todayKey: string) {
  localStorage.setItem(NOTIFY_DAILY_LAST_FIRED_KEY, todayKey);
}

// ---------- 표시 설정 ----------
const DARK_MODE_KEY = "daily-planner-dark-mode";

/** 다크 모드 토글 상태 (localStorage) */
export function getDarkMode(): boolean {
  return localStorage.getItem(DARK_MODE_KEY) === "1";
}

export function setDarkMode(v: boolean) {
  localStorage.setItem(DARK_MODE_KEY, v ? "1" : "0");
}

/** html 요소에 .dark 클래스를 붙였다 뗐다 해서 실제 색 전환을 적용 (CSS 변수 재정의는 index.css) */
export function applyDarkMode(v: boolean) {
  document.documentElement.classList.toggle("dark", v);
}

// ---------- 테마 ----------
// 실제 색값은 index.css의 CSS 변수(:root / html.dark)에서 정의한다.
// 여기서는 변수 참조만 노출해, 인라인 style로 색을 쓰는 곳도 다크 모드에서 함께 전환되게 한다.
export const P = {
  paper: "var(--paper)",
  card: "var(--card)",
  ink: "var(--ink)",
  faint: "var(--faint)",
  line: "var(--divider)",
  green: "var(--green)",
  sage: "var(--sage)",
  highlight: "var(--highlight)",
  red: "var(--red)",
  blue: "var(--blue)",
  orange: "var(--orange)",
};

// ---------- 통계 집계 ----------
/** 통계 차트용 색상 팔레트 (P 팔레트 기반) */
export const CHART_COLORS = [P.green, P.highlight, P.blue, P.red, "#7D3C98", P.sage];

/** 특정 습관의 해당 월(1일~말일, 미래는 오늘까지) 달성률(%) */
export function getHabitMonthRate(habitId: string, year: number, month: number): number {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeEnd = monthEnd < today ? monthEnd : today;
  if (rangeEnd < monthStart) return 0;
  return habitRateForRange(habitId, monthStart, rangeEnd);
}

export interface DayTaskStat {
  day: number;
  total: number;
  done: number;
  rate: number | null; // 그 날 할 일이 없으면 null
}

export interface HabitMonthStat {
  habit: Habit;
  rate: number; // 이번(조회 중인) 달 달성률(%)
  streak: number; // 현재(오늘 기준) 연속 스트릭
}

export interface HourBucket {
  hour: number; // 6~23
  minutes: number; // 그 달 동안 이 시간대에 등록된 시간표 블록 총 분
}

export interface MonthStats {
  year: number;
  month: number;
  daysInMonth: number;
  taskByDay: DayTaskStat[];
  recordedDays: number; // 무언가(할 일/일정/메모)라도 기록된 날 수
  totalTasks: number;
  totalDone: number;
  overallTaskRate: number; // 0~100
  habitStats: HabitMonthStat[];
  avgHabitRate: number; // 0~100, 적용 가능한 습관이 없으면 0
  longestHabitStreak: number; // 습관 중 최장 현재 스트릭
  hourBuckets: HourBucket[];
  totalBlockMinutes: number;
}

/** 해당 월의 할 일/습관/시간표 데이터를 한 번에 집계 (읽기 전용, 저장 데이터는 수정하지 않음) */
export function getMonthStats(year: number, month: number): MonthStats {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthEndKey = dateKey(year, month, daysInMonth);

  const taskByDay: DayTaskStat[] = [];
  const hourMinutes = new Map<number, number>();
  let recordedDays = 0;
  let totalTasks = 0;
  let totalDone = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const data = loadDay(dateKey(year, month, d));
    const hasData =
      data.tasks.length > 0 || data.blocks.length > 0 || data.memo.trim() !== "";
    if (hasData) recordedDays++;

    const done = data.tasks.filter((t) => t.done).length;
    totalTasks += data.tasks.length;
    totalDone += done;
    taskByDay.push({
      day: d,
      total: data.tasks.length,
      done,
      rate: data.tasks.length ? Math.round((done / data.tasks.length) * 100) : null,
    });

    for (const b of data.blocks) {
      const firstHour = Math.floor(b.start / 60);
      const lastHour = Math.floor((b.end - 1) / 60);
      for (let h = firstHour; h <= lastHour; h++) {
        const rowStart = h * 60;
        const rowEnd = rowStart + 60;
        const segStart = Math.max(b.start, rowStart);
        const segEnd = Math.min(b.end, rowEnd);
        if (segEnd > segStart) hourMinutes.set(h, (hourMinutes.get(h) ?? 0) + (segEnd - segStart));
      }
    }
  }

  const habitStats: HabitMonthStat[] = loadHabits()
    .filter((h) => h.createdAt <= monthEndKey)
    .map((h) => ({
      habit: h,
      rate: getHabitMonthRate(h.id, year, month),
      streak: getStreak(h.id),
    }));
  const avgHabitRate = habitStats.length
    ? Math.round(habitStats.reduce((sum, h) => sum + h.rate, 0) / habitStats.length)
    : 0;
  const longestHabitStreak = habitStats.length ? Math.max(...habitStats.map((h) => h.streak)) : 0;

  const hourBuckets: HourBucket[] = HOURS.map((h) => ({ hour: h, minutes: hourMinutes.get(h) ?? 0 }));
  const totalBlockMinutes = hourBuckets.reduce((sum, b) => sum + b.minutes, 0);

  return {
    year,
    month,
    daysInMonth,
    taskByDay,
    recordedDays,
    totalTasks,
    totalDone,
    overallTaskRate: totalTasks ? Math.round((totalDone / totalTasks) * 100) : 0,
    habitStats,
    avgHabitRate,
    longestHabitStreak,
    hourBuckets,
    totalBlockMinutes,
  };
}
