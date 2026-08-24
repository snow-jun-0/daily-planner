import { useCallback, useEffect, useRef, useState } from "react";
import { dateKey } from "./lib";

// ---------- 타입 ----------
export type PomodoroPhase = "focus" | "break";
export type PomodoroStatus = "idle" | "running" | "paused";

export interface PomodoroSettings {
  focusMin: number;
  breakMin: number;
}

export interface PhaseTransition {
  phase: PomodoroPhase; // 방금 끝난 단계
  next: PomodoroPhase; // 이제 시작하는 단계
}

// ---------- 설정 저장소 ----------
const SETTINGS_KEY = "daily-planner-pomodoro-settings";
const DEFAULT_SETTINGS: PomodoroSettings = { focusMin: 25, breakMin: 5 };

export function loadPomodoroSettings(): PomodoroSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PomodoroSettings>) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function savePomodoroSettings(s: PomodoroSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ---------- 실행 상태 저장소 (endTime 기준 — 새로고침/백그라운드에도 정확) ----------
interface StoredState {
  phase: PomodoroPhase;
  status: PomodoroStatus;
  endTime: number | null; // epoch ms, status==="running"일 때만 유효
  remainingMs: number; // status!=="running"일 때 기준값
  label: string | null; // 연동된 시간표 일정 이름
}

const STATE_KEY = "daily-planner-pomodoro-state";

function defaultState(settings: PomodoroSettings): StoredState {
  return { phase: "focus", status: "idle", endTime: null, remainingMs: settings.focusMin * 60_000, label: null };
}

function loadState(settings: PomodoroSettings): StoredState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as StoredState) : defaultState(settings);
  } catch {
    return defaultState(settings);
  }
}

function saveState(s: StoredState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s));
}

// ---------- 완료한 뽀모도로(집중 세션) 개수 — 날짜별 ----------
const LOG_KEY = "daily-planner-pomodoro-log-v1";

function loadLog(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveLog(log: Record<string, number>) {
  localStorage.setItem(LOG_KEY, JSON.stringify(log));
}

function todayKey(): string {
  const t = new Date();
  return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
}

export function getTodayPomodoroCount(): number {
  return loadLog()[todayKey()] ?? 0;
}

function incrementTodayPomodoroCount(): number {
  const log = loadLog();
  const k = todayKey();
  const next = (log[k] ?? 0) + 1;
  log[k] = next;
  saveLog(log);
  return next;
}

// ---------- 알림 ----------
export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // 거부/실패해도 화면 표시로 대체되므로 무시
    }
  }
}

let audioCtx: AudioContext | null = null;

/** 세션 종료 알림음 (짧은 2음 비프). 에셋 없이 Web Audio로 생성 */
function playBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    [0, 0.18].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.19);
    });
  } catch {
    // 소리 재생 실패는 무시 (알림/화면 표시로 충분)
  }
}

function notifyPhaseEnd(t: PhaseTransition) {
  playBeep();
  const title = t.phase === "focus" ? "집중 끝!" : "휴식 끝!";
  const body = t.next === "focus" ? "다시 집중을 시작해봐" : "잠깐 쉬어가자";
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, { body });
    } catch {
      // 알림 실패 시에도 justCompleted 화면 표시가 이미 대체 수단
    }
  }
}

// ---------- 포맷 ----------
export function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------- 훅 ----------
export interface PomodoroApi {
  phase: PomodoroPhase;
  status: PomodoroStatus;
  label: string | null;
  remainingMs: number; // 항상 endTime - Date.now() 기준으로 매 렌더 재계산
  durationMs: number;
  settings: PomodoroSettings;
  todayCount: number;
  justCompleted: PhaseTransition | null;
  start: (label?: string | null) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => void;
  updateSettings: (s: PomodoroSettings) => void;
  clearJustCompleted: () => void;
}

export function usePomodoro(): PomodoroApi {
  const [settings, setSettings] = useState<PomodoroSettings>(() => loadPomodoroSettings());
  const [state, setState] = useState<StoredState>(() => loadState(settings));
  const [todayCount, setTodayCount] = useState(() => getTodayPomodoroCount());
  const [, setTick] = useState(0); // 1초마다 화면 갱신용 (실제 남은 시간 계산에는 안 씀)
  const [justCompleted, setJustCompleted] = useState<PhaseTransition | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => saveState(state), [state]);

  const durationFor = useCallback((phase: PomodoroPhase, s: PomodoroSettings) =>
    (phase === "focus" ? s.focusMin : s.breakMin) * 60_000, []);

  /** 남은 시간이 0이 된 세션을 다음 단계로 전환. 부수효과(알림/카운트)는 여기서 직접 처리 —
   *  setState 업데이트 함수 안에 넣으면 StrictMode가 두 번 실행해 중복 알림/카운트가 생길 수 있음 */
  const advancePhase = useCallback(() => {
    const prev = stateRef.current;
    const finishedPhase = prev.phase;
    const nextPhase: PomodoroPhase = finishedPhase === "focus" ? "break" : "focus";
    if (finishedPhase === "focus") setTodayCount(incrementTodayPomodoroCount());
    const transition: PhaseTransition = { phase: finishedPhase, next: nextPhase };
    setJustCompleted(transition);
    notifyPhaseEnd(transition);
    const dur = durationFor(nextPhase, settingsRef.current);
    setState({ phase: nextPhase, status: "running", endTime: Date.now() + dur, remainingMs: dur, label: prev.label });
  }, [durationFor]);

  // setInterval 틱과 visibilitychange가 리렌더 전에 연달아 발생하면 같은 만료를 두 번 처리할 수 있어,
  // 마지막으로 처리한 endTime을 기억해 중복 전환을 막는다
  const handledEndTimeRef = useRef<number | null>(null);
  const checkExpired = useCallback(() => {
    const s = stateRef.current;
    if (s.status === "running" && s.endTime !== null && s.endTime - Date.now() <= 0) {
      if (handledEndTimeRef.current === s.endTime) return;
      handledEndTimeRef.current = s.endTime;
      advancePhase();
    }
  }, [advancePhase]);

  // 화면 갱신용 틱 (실제 남은 시간은 항상 endTime 기준으로 계산)
  useEffect(() => {
    const t = setInterval(() => {
      setTick((v) => v + 1);
      checkExpired();
    }, 1000);
    return () => clearInterval(t);
  }, [checkExpired]);

  // 탭이 백그라운드였다가 다시 보일 때 즉시 재계산 (setInterval이 백그라운드에서 스로틀돼도 복귀 즉시 정확해짐)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      setTick((v) => v + 1);
      checkExpired();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [checkExpired]);

  const remainingMs = state.status === "running" && state.endTime !== null
    ? Math.max(0, state.endTime - Date.now())
    : state.remainingMs;

  const start = useCallback((label?: string | null) => {
    void requestNotificationPermission();
    const dur = durationFor("focus", settingsRef.current);
    setJustCompleted(null);
    setState({ phase: "focus", status: "running", endTime: Date.now() + dur, remainingMs: dur, label: label ?? null });
  }, [durationFor]);

  const pause = useCallback(() => {
    setState((prev) => {
      if (prev.status !== "running" || prev.endTime === null) return prev;
      return { ...prev, status: "paused", remainingMs: Math.max(0, prev.endTime - Date.now()), endTime: null };
    });
  }, []);

  const resume = useCallback(() => {
    void requestNotificationPermission();
    setState((prev) => {
      if (prev.status !== "paused") return prev;
      return { ...prev, status: "running", endTime: Date.now() + prev.remainingMs };
    });
  }, []);

  const reset = useCallback(() => {
    setJustCompleted(null);
    setState((prev) => ({
      phase: "focus",
      status: "idle",
      endTime: null,
      remainingMs: durationFor("focus", settingsRef.current),
      label: prev.label,
    }));
  }, [durationFor]);

  const skip = useCallback(() => {
    setJustCompleted(null);
    advancePhase();
  }, [advancePhase]);

  const updateSettings = useCallback((next: PomodoroSettings) => {
    setSettings(next);
    savePomodoroSettings(next);
    setState((prev) => (prev.status === "idle" ? { ...prev, remainingMs: durationFor(prev.phase, next) } : prev));
  }, [durationFor]);

  const clearJustCompleted = useCallback(() => setJustCompleted(null), []);

  return {
    phase: state.phase,
    status: state.status,
    label: state.label,
    remainingMs,
    durationMs: durationFor(state.phase, settings),
    settings,
    todayCount,
    justCompleted,
    start,
    pause,
    resume,
    reset,
    skip,
    updateSettings,
    clearJustCompleted,
  };
}
