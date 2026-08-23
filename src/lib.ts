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
  mood?: string; // 오늘 기분 이모지
}

export const EMPTY_DAY: DayData = { tasks: [], blocks: [], memo: "" };

export const MOODS = ["😊", "😴", "🔥", "😵‍💫", "🥲", "😎"];

export const PRIORITIES: { id: Priority; label: string; color: string; bg: string }[] = [
  { id: "high", label: "중요", color: "#C0392B", bg: "#FBEAE7" },
  { id: "mid", label: "보통", color: "#2F6B4F", bg: "#E8F1EB" },
  { id: "low", label: "여유", color: "#8A968E", bg: "#EFF2EE" },
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
    data.memo.trim() === "" && !data.mood;
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

/** 특정 날짜의 할 일을 완료 처리 */
export function markTaskDone(key: string, taskId: string) {
  const day = loadDay(key);
  saveDay(key, { ...day, tasks: day.tasks.map((t) => (t.id === taskId ? { ...t, done: true } : t)) });
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

// ---------- 테마 ----------
export const P = {
  paper: "#F4F6F1",
  card: "#FDFEFB",
  ink: "#22302A",
  faint: "#8A968E",
  line: "#DDE4DC",
  green: "#2F6B4F",
  sage: "#9DB8A4",
  highlight: "#F5D547",
  red: "#C0392B",
};
