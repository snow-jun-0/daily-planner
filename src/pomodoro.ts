import { useCallback, useEffect, useRef, useState } from "react";
import { dateKey, getNotifyMode } from "./lib";

// ---------- 타입 ----------
export type PomodoroPhase = "focus" | "break";
// "awaiting" = 시간이 끝났지만 사용자가 확인(확인 버튼)하기 전까지 다음 단계로 넘어가지 않고 대기하는 상태
export type PomodoroStatus = "idle" | "running" | "paused" | "awaiting";

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
  // status==="awaiting"에서 사용자가 "확인"을 눌러 반복 알림을 끈 뒤의 "조용한 완료" 여부.
  // true면 알림은 멈췄지만 여전히 완료 대기 상태이고, "휴식 시작 / 처음으로" 선택을 기다린다.
  alarmSilenced?: boolean;
  // 일정에서 연 타이머: 그 일정 길이만큼 집중(설정값 대신 사용). 휴식 없음.
  customFocusMs?: number;
  noBreak?: boolean; // true면 집중이 끝나도 휴식 단계로 넘어가지 않고 그냥 완료
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

/** 해당 월의 완료 뽀모도로 세션 개수·누적 집중 분(현재 focusMin 설정 기준 추정) */
export function getMonthPomodoroStats(year: number, month: number): { count: number; minutes: number } {
  const log = loadLog();
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  let count = 0;
  for (const [k, v] of Object.entries(log)) {
    if (k.startsWith(prefix)) count += v;
  }
  return { count, minutes: count * loadPomodoroSettings().focusMin };
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

/** 완료 대기 상태에서 사용자가 확인하기 전까지 "계속" 울리는 반복 알림.
 *  호출 시점의 알림 방식(무음/진동/소리)을 캡처하고, 알림을 멈추는 정리 함수를 돌려준다.
 *  - 소리: 짧은 비프를 1.3초 간격으로 반복
 *  - 진동: navigator.vibrate 패턴을 1.5초 간격으로 반복 (지원 안 되면 no-op)
 *  - 무음: 아무 것도 하지 않음 (화면 표시는 모달이 담당)
 *  반드시 반환된 정리 함수를 호출해 setInterval/진동을 정리할 것 (확인/모달 닫힘 시). */
export function startPhaseEndAlarm(): () => void {
  const mode = getNotifyMode();

  if (mode === "sound") {
    playBeep(); // 즉시 1회
    const id = setInterval(playBeep, 1300);
    return () => clearInterval(id);
  }

  if (mode === "vibrate") {
    const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
    if (!canVibrate) return () => {}; // 데스크톱 크롬/ iOS 사파리 등 미지원 — 화면 표시로 대체
    const buzz = () => navigator.vibrate([500, 250, 500]);
    buzz(); // 즉시 1회
    const id = setInterval(buzz, 1500);
    return () => {
      clearInterval(id);
      navigator.vibrate(0); // 진행 중인 진동 취소
    };
  }

  return () => {}; // mute
}

/** 단계 종료 시 1회성 시스템 알림(OS 알림). 소리/진동 반복은 startPhaseEndAlarm이 전담한다.
 *  justCompleted 화면 배너는 이 함수와 별개로 항상 뜨므로, "무음"이어도 시각적 알림은 유지된다 */
function notifyPhaseEnd(t: PhaseTransition) {
  const mode = getNotifyMode();
  const title = t.phase === "focus" ? "집중 끝!" : "휴식 끝!";
  const body = t.next === "focus" ? "다시 집중을 시작해봐" : "잠깐 쉬어가자";

  if (mode !== "mute" && typeof Notification !== "undefined" && Notification.permission === "granted") {
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
  /** awaiting 중 반복 알림이 아직 울리고 있는지 (false면 "확인"을 눌러 조용해진 상태) */
  alarmActive: boolean;
  /** 현재 세션이 일정에서 연 "휴식 없는" 타이머인지 (UI 라벨/설정 패널 분기용) */
  sessionNoBreak: boolean;
  start: (label?: string | null) => void;
  /** 일정에서 ▶ 로 열기 — 일정 길이만큼 집중, 자동 시작 없이 대기 상태로 */
  openForSchedule: (label: string, focusMin: number) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => void;
  /** 완료 대기(awaiting) 1단계: "확인" 버튼. 반복 알림만 멈추고 상태는 완료 대기 유지 */
  silenceAlarm: () => void;
  /** 완료 대기(awaiting) 2단계: "휴식 시작 / 집중 시작" 버튼. 다음 단계로 전환 + 세션 카운트 반영 */
  confirm: () => void;
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

  /** 현재 상태 기준 집중 단계 길이 — 일정에서 연 타이머면 그 일정 길이(customFocusMs), 아니면 설정값 */
  const focusDurationFor = useCallback((st: StoredState, s: PomodoroSettings) =>
    st.customFocusMs && st.customFocusMs > 0 ? st.customFocusMs : s.focusMin * 60_000, []);

  /** 다음 단계로 실제 전환. countFocus면 방금 끝난 집중 세션을 오늘 카운트에 반영.
   *  부수효과(카운트)는 여기서 직접 처리 — setState 업데이트 함수 안에 넣으면 StrictMode가
   *  두 번 실행해 중복 카운트가 생길 수 있음 */
  const goToNextPhase = useCallback((countFocus: boolean) => {
    const prev = stateRef.current;
    const finishedPhase = prev.phase;
    if (countFocus && finishedPhase === "focus") setTodayCount(incrementTodayPomodoroCount());
    setJustCompleted(null);
    // 휴식 없는 일정 타이머: 집중이 끝나면 억지 휴식 단계 없이 그냥 완료(대기) 상태로
    if (finishedPhase === "focus" && prev.noBreak) {
      setState({
        phase: "focus", status: "idle", endTime: null,
        remainingMs: focusDurationFor(prev, settingsRef.current), label: prev.label,
        customFocusMs: prev.customFocusMs, noBreak: prev.noBreak,
      });
      return;
    }
    const nextPhase: PomodoroPhase = finishedPhase === "focus" ? "break" : "focus";
    const dur = durationFor(nextPhase, settingsRef.current);
    setState({ phase: nextPhase, status: "running", endTime: Date.now() + dur, remainingMs: dur, label: prev.label });
  }, [durationFor, focusDurationFor]);

  /** 시간이 0이 된 세션을 "완료 대기(awaiting)" 상태로 전환. 다음 단계로 자동 전환하지 않고 멈춘다.
   *  1회성 알림(시스템 알림/소리·진동 1회)만 여기서 처리하고, 확인 전까지 계속 울리는 반복 알림은
   *  TimerModal이 awaiting 동안 startPhaseEndAlarm으로 담당한다 */
  const enterAwaiting = useCallback(() => {
    const prev = stateRef.current;
    const finishedPhase = prev.phase;
    // 휴식 없는 일정 타이머: 다음 단계를 "focus"로 둬서 UI가 억지 휴식 안내를 하지 않게 한다
    const nextPhase: PomodoroPhase =
      finishedPhase === "focus" ? (prev.noBreak ? "focus" : "break") : "focus";
    const transition: PhaseTransition = { phase: finishedPhase, next: nextPhase };
    setJustCompleted(transition);
    notifyPhaseEnd(transition);
    setState({ ...prev, status: "awaiting", endTime: null, remainingMs: 0, alarmSilenced: false });
  }, []);

  // setInterval 틱과 visibilitychange가 리렌더 전에 연달아 발생하면 같은 만료를 두 번 처리할 수 있어,
  // 마지막으로 처리한 endTime을 기억해 중복 전환을 막는다
  const handledEndTimeRef = useRef<number | null>(null);
  const checkExpired = useCallback(() => {
    const s = stateRef.current;
    if (s.status === "running" && s.endTime !== null && s.endTime - Date.now() <= 0) {
      if (handledEndTimeRef.current === s.endTime) return;
      handledEndTimeRef.current = s.endTime;
      enterAwaiting();
    }
  }, [enterAwaiting]);

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
    setJustCompleted(null);
    setState((prev) => {
      // idle 상태에서 시작하면 일정 길이 세팅(customFocusMs/noBreak)을 이어받는다
      const carry = prev.status === "idle";
      const customFocusMs = carry ? prev.customFocusMs : undefined;
      const noBreak = carry ? prev.noBreak : undefined;
      const dur = customFocusMs && customFocusMs > 0 ? customFocusMs : durationFor("focus", settingsRef.current);
      return {
        phase: "focus", status: "running", endTime: Date.now() + dur, remainingMs: dur,
        label: label ?? prev.label ?? null, customFocusMs, noBreak,
      };
    });
  }, [durationFor]);

  /** 일정(앱 블록/구글/반복)에서 ▶ 로 연 타이머: 그 일정 길이만큼 집중 시간을 세팅하되
   *  자동 시작하지 않고 "대기(idle)" 상태로 연다. 휴식 단계는 없음. */
  const openForSchedule = useCallback((label: string, focusMin: number) => {
    const dur = Math.max(1, Math.round(focusMin)) * 60_000;
    setJustCompleted(null);
    setState({
      phase: "focus", status: "idle", endTime: null, remainingMs: dur,
      label, customFocusMs: dur, noBreak: true,
    });
  }, []);

  const pause = useCallback(() => {
    setState((prev) => {
      if (prev.status !== "running" || prev.endTime === null) return prev;
      return { ...prev, status: "paused", remainingMs: Math.max(0, prev.endTime - Date.now()), endTime: null };
    });
  }, []);

  const resume = useCallback(() => {
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
    const prev = stateRef.current;
    if (prev.status === "idle") return;
    // 사용자가 직접 넘김: 대기 없이 즉시 다음 단계로. 끝난 게 집중이면 카운트 반영(기존 동작 유지)
    goToNextPhase(true);
  }, [goToNextPhase]);

  // 1단계 "확인": 반복 알림만 끈다 (TimerModal 알림 effect가 alarmSilenced를 보고 정리).
  // 상태는 awaiting 그대로 — 다음 단계로 넘어가지 않고 "휴식 시작 / 처음으로" 선택을 기다린다.
  const silenceAlarm = useCallback(() => {
    setState((prev) => (prev.status === "awaiting" && !prev.alarmSilenced ? { ...prev, alarmSilenced: true } : prev));
  }, []);

  // 2단계 "휴식 시작 / 집중 시작": 다음 단계로 전환 + (집중이 끝났으면) 세션 카운트 반영
  const confirm = useCallback(() => {
    if (stateRef.current.status !== "awaiting") return;
    goToNextPhase(true);
  }, [goToNextPhase]);

  const updateSettings = useCallback((next: PomodoroSettings) => {
    setSettings(next);
    savePomodoroSettings(next);
    setState((prev) =>
      prev.status === "idle" && !prev.customFocusMs ? { ...prev, remainingMs: durationFor(prev.phase, next) } : prev);
  }, [durationFor]);

  const clearJustCompleted = useCallback(() => setJustCompleted(null), []);

  return {
    phase: state.phase,
    status: state.status,
    label: state.label,
    remainingMs,
    durationMs: state.phase === "focus" ? focusDurationFor(state, settings) : durationFor(state.phase, settings),
    settings,
    todayCount,
    justCompleted,
    alarmActive: state.status === "awaiting" && !state.alarmSilenced,
    sessionNoBreak: state.noBreak ?? false,
    start,
    openForSchedule,
    pause,
    resume,
    reset,
    skip,
    silenceAlarm,
    confirm,
    updateSettings,
    clearJustCompleted,
  };
}
