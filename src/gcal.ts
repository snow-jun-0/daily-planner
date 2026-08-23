// ---------- 구글 캘린더 연동 (GIS 토큰 방식, 프론트엔드 전용) ----------
// 서버 함수 없이 브라우저에서 직접 Google Identity Services + Calendar REST API를 사용한다.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function hasGoogleConfig(): boolean {
  return !!CLIENT_ID;
}

export interface GEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

// ---------- gsi/client 스크립트 동적 로드 ----------
declare global {
  interface Window {
    google?: any;
  }
}

let gsiLoadPromise: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gsiLoadPromise) return gsiLoadPromise;
  gsiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("구글 로그인 스크립트를 불러오지 못했어"));
    document.head.appendChild(script);
  });
  return gsiLoadPromise;
}

// ---------- 토큰 저장 ----------
const TOKEN_KEY = "daily-planner-gcal-token";

interface StoredToken {
  access_token: string;
  expires_at: number; // epoch ms
}

function saveToken(t: StoredToken) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

export function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    if (Date.now() >= t.expires_at - 60_000) return null; // 만료 1분 전이면 무효 처리
    return t.access_token;
  } catch {
    return null;
  }
}

export function isSignedIn(): boolean {
  return getStoredToken() !== null;
}

export function signOutGoogle() {
  const raw = localStorage.getItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  try {
    if (raw) {
      const t = JSON.parse(raw) as StoredToken;
      window.google?.accounts?.oauth2?.revoke?.(t.access_token);
    }
  } catch {
    // 무시
  }
}

export async function signInGoogle(): Promise<void> {
  if (!CLIENT_ID) throw new Error("VITE_GOOGLE_CLIENT_ID가 설정되어 있지 않아");
  await loadGsi();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: any) => {
        if (resp.error) {
          reject(new Error(resp.error));
          return;
        }
        saveToken({
          access_token: resp.access_token,
          expires_at: Date.now() + Number(resp.expires_in) * 1000,
        });
        resolve();
      },
    });
    client.requestAccessToken();
  });
}

// ---------- Calendar REST API ----------
const API_BASE = "https://www.googleapis.com/calendar/v3";

async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const token = getStoredToken();
  if (!token) throw new Error("NOT_SIGNED_IN");

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error("NOT_SIGNED_IN");
  }
  if (!res.ok) {
    throw new Error(`구글 캘린더 요청 실패 (${res.status}): ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * 종일 일정(date만 있음)은 구글 서버가 timeMin/timeMax를 어느 타임존 기준으로 겹침 판정하는지가
 * 명확하지 않아, 서버 쪽 timeMin/timeMax는 하루씩 여유를 두고 넓게 가져온 뒤
 * 실제로 그 날짜를 포함하는 이벤트인지는 여기서 다시 정확히 걸러낸다.
 */
export function eventCoversDate(ev: GEvent, dateStr: string): boolean {
  if (isAllDayEvent(ev)) {
    const s = ev.start.date as string;
    const e = (ev.end?.date as string | undefined) ?? s; // 구글 종일 일정의 end.date는 다음날(배타적)로 온다
    return s <= dateStr && dateStr < e;
  }
  if (!ev.start.dateTime || !ev.end.dateTime) return false;
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const evStart = new Date(ev.start.dateTime);
  const evEnd = new Date(ev.end.dateTime);
  return evStart < dayEnd && evEnd > dayStart;
}

async function listEventsBetween(rangeStart: Date, rangeEnd: Date): Promise<GEvent[]> {
  const params = new URLSearchParams({
    timeMin: rangeStart.toISOString(),
    timeMax: rangeEnd.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    timeZone: tz(),
    maxResults: "2500",
  });
  const data = await apiFetch(`/calendars/primary/events?${params.toString()}`);
  return (data?.items ?? []) as GEvent[];
}

export async function listEventsForDate(dateStr: string): Promise<GEvent[]> {
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const rangeStart = new Date(dayStart);
  rangeStart.setDate(rangeStart.getDate() - 1);
  const rangeEnd = new Date(dayStart);
  rangeEnd.setDate(rangeEnd.getDate() + 2);
  const items = await listEventsBetween(rangeStart, rangeEnd);
  return items.filter((ev) => eventCoversDate(ev, dateStr));
}

/** 해당 달(1일~말일)에 걸치는 모든 구글 이벤트를 한 번에 가져온다. 날짜별 분배는 호출부에서 eventCoversDate로 처리 */
export async function listEventsForMonth(year: number, month: number): Promise<GEvent[]> {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const rangeStart = new Date(first);
  rangeStart.setDate(rangeStart.getDate() - 1);
  const rangeEnd = new Date(last);
  rangeEnd.setDate(rangeEnd.getDate() + 2);
  return listEventsBetween(rangeStart, rangeEnd);
}

/** "YYYY-MM-DD" + 분(자정 기준, 1440 넘으면 다음날로 넘김)을 로컬 dateTime 문자열로 변환 */
function dateTimeFromMinutes(dateStr: string, min: number): string {
  const dayOffset = Math.floor(min / 1440);
  const mm = ((min % 1440) + 1440) % 1440;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + dayOffset);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = Math.floor(mm / 60);
  const m = mm % 60;
  return `${y}-${mo}-${da}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** 특정 블록이 이미 구글 캘린더에 등록됐는지, plannerId(extendedProperties.private.plannerId)로 확인 */
export function findEventByPlannerId(events: GEvent[], plannerId: string): GEvent | undefined {
  return events.find((ev) => ev.extendedProperties?.private?.plannerId === plannerId);
}

export async function createEvent(
  dateStr: string,
  title: string,
  start: number, // 분 단위 (자정 기준)
  end: number, // 분 단위 (자정 기준)
  plannerId: string
): Promise<GEvent> {
  const body = {
    summary: title,
    start: { dateTime: dateTimeFromMinutes(dateStr, start), timeZone: tz() },
    end: { dateTime: dateTimeFromMinutes(dateStr, end), timeZone: tz() },
    extendedProperties: {
      private: { plannerId, plannerSource: "daily-planner" },
    },
  };
  return apiFetch("/calendars/primary/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await apiFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
}

/** 종일 일정인지 (start/end가 date만 있고 dateTime이 없음) */
export function isAllDayEvent(ev: GEvent): boolean {
  return !ev.start.dateTime && !!ev.start.date;
}

/** 이벤트의 dateTime을 분 단위(자정 기준)로 변환. 종일 일정(date만 있음)이면 null */
export function eventToMinutes(ev: GEvent): { start: number; end: number } | null {
  if (!ev.start.dateTime || !ev.end.dateTime) return null;
  const toMin = (iso: string) => {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  };
  return { start: toMin(ev.start.dateTime), end: toMin(ev.end.dateTime) };
}
