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
  start: number; // 시 (6~23)
  end: number; // 시 (7~24)
}

/** 반복 일정: 특정 요일마다 반복되는 고정 일정 (예: 매주 월/수 09-11 수업) */
export interface RecurringBlock {
  id: string;
  title: string;
  days: number[]; // 요일 0(일)~6(토), 여러 개 가능
  start: number;
  end: number;
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

export const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06~23

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
  return store[key] ?? { ...EMPTY_DAY };
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

// ---------- 반복 일정 저장소 ----------
const RECUR_KEY = "daily-planner-recurring-v1";

export function loadRecurring(): RecurringBlock[] {
  try {
    const raw = localStorage.getItem(RECUR_KEY);
    return raw ? (JSON.parse(raw) as RecurringBlock[]) : [];
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

  for (const [key, day] of Object.entries(store)) {
    const ymd = key.replace(/-/g, "");
    for (const b of day.blocks) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${key}-${b.id}@daily-planner`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${ymd}T${String(b.start).padStart(2, "0")}0000`,
        `DTEND:${ymd}T${String(b.end).padStart(2, "0")}0000`,
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
        `DTSTART;VALUE=DATE:${ymd}`,
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
