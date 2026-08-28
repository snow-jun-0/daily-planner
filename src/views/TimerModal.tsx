import { useEffect, useRef, useState } from "react";
import { P } from "../lib";
import { PomodoroApi, formatMs } from "../pomodoro";
import GhostButton from "./GhostButton";

interface Props {
  api: PomodoroApi;
  onClose: () => void;
}

const SIZE = 240;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;
const CX = SIZE / 2;
const CY = SIZE / 2;

const DOT_CAP = 4;
const UNLOCK_HOLD_MS = 1500;

/** 진행 링 — 우로보로스(뱀) 버전을 시도했지만 이 크기에서는 머리 모양이 알아보기 어려워
 *  깔끔한 일반 원형 링으로 폴백했다 (배경 회색 트랙 + 남은 시간만큼 채워지는 색 링). */
function ProgressRing({ progress, bodyColor }: { progress: number; bodyColor: string }) {
  const offset = CIRC * (1 - progress);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full -rotate-90">
      <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke="var(--line)" strokeWidth={STROKE} />
      <circle
        cx={CX} cy={CY} r={RADIUS} fill="none" stroke={bodyColor} strokeWidth={STROKE} strokeLinecap="round"
        strokeDasharray={CIRC} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.3s linear, stroke 0.3s ease" }}
      />
    </svg>
  );
}

export default function TimerModal({ api, onClose }: Props) {
  const {
    phase, status, label, remainingMs, durationMs, settings, todayCount, justCompleted,
    start, pause, resume, reset, skip, updateSettings, clearJustCompleted,
  } = api;

  const [locked, setLocked] = useState(false);
  const [pressing, setPressing] = useState(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 완료 배너는 몇 초 뒤 자동으로 사라짐
  useEffect(() => {
    if (!justCompleted) return;
    const t = setTimeout(clearJustCompleted, 4000);
    return () => clearTimeout(t);
  }, [justCompleted, clearJustCompleted]);

  useEffect(() => () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
  }, []);

  const progress = durationMs > 0 ? Math.min(1, Math.max(0, remainingMs / durationMs)) : 0;
  const ringColor = phase === "focus" ? P.green : P.sage;

  const phaseLabel =
    status === "idle" ? "대기 중" : status === "paused" ? "일시정지" : phase === "focus" ? "집중 중" : "휴식 중";

  const setFocusMin = (v: number) => updateSettings({ ...settings, focusMin: Math.min(90, Math.max(1, v)) });
  const setBreakMin = (v: number) => updateSettings({ ...settings, breakMin: Math.min(60, Math.max(1, v)) });

  const startUnlockHold = () => {
    setPressing(true);
    pressTimerRef.current = setTimeout(() => {
      setLocked(false);
      setPressing(false);
    }, UNLOCK_HOLD_MS);
  };
  const cancelUnlockHold = () => {
    setPressing(false);
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>뽀모도로 타이머</h2>
          <div className="flex items-center gap-1">
            {!locked && <GhostButton icon="🔒" label="화면 잠금" onClick={() => setLocked(true)} title="컨트롤을 잠가서 실수로 안 눌리게 해" />}
            <button onClick={onClose} className="text-lg px-2" style={{ color: P.faint }} aria-label="닫기">✕</button>
          </div>
        </div>

        {justCompleted && (
          <div className="text-xs text-center mb-3 px-3 py-2 rounded-lg font-medium" style={{ background: `color-mix(in srgb, ${ringColor} 14%, transparent)`, color: ringColor }}>
            {justCompleted.phase === "focus" ? "집중 끝! 잠깐 쉬어가자 🎉" : "휴식 끝! 다시 집중해볼까?"}
          </div>
        )}

        {/* 상태 알약 + 연동된 일정 이름 */}
        <div className="flex justify-center mb-1">
          <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: `color-mix(in srgb, ${ringColor} 14%, transparent)`, color: ringColor }}>
            {phaseLabel}
          </span>
        </div>
        {label && (
          <p className="text-xs text-center mb-1 truncate" style={{ color: P.faint }}>
            🎯 {label}
          </p>
        )}

        {/* 진행 링 (우로보로스) */}
        <div className="flex justify-center my-4">
          <div className="relative w-56 h-56 sm:w-64 sm:h-64">
            <ProgressRing progress={progress} bodyColor={ringColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span style={{ fontFamily: "'Gowun Batang', serif", fontSize: 44, fontVariantNumeric: "tabular-nums", color: P.ink, fontWeight: 700 }}>
                {formatMs(remainingMs)}
              </span>
            </div>
          </div>
        </div>

        {locked ? (
          <div className="mb-4">
            <div className="relative overflow-hidden rounded-xl" style={{ background: P.paper }}>
              <div
                className="absolute inset-0"
                style={{
                  background: ringColor,
                  transformOrigin: "left",
                  transform: pressing ? "scaleX(1)" : "scaleX(0)",
                  transition: pressing ? `transform ${UNLOCK_HOLD_MS}ms linear` : "transform 0.15s ease",
                }}
              />
              <button
                onPointerDown={startUnlockHold}
                onPointerUp={cancelUnlockHold}
                onPointerLeave={cancelUnlockHold}
                onPointerCancel={cancelUnlockHold}
                className="relative w-full py-4 text-center text-sm font-semibold select-none"
                style={{ color: pressing ? "#fff" : P.faint }}
              >
                🔒 길게 눌러 해제
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 컨트롤 3버튼 */}
            <div className="flex items-center justify-center gap-5 mb-4">
              <button onClick={reset} className="flex flex-col items-center gap-1">
                <span className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, border: `1px solid ${P.line}`, fontSize: 18, color: P.faint }}>
                  ↺
                </span>
                <span className="text-[11px] font-medium" style={{ color: P.faint }}>처음으로</span>
              </button>

              {status === "running" ? (
                <button onClick={pause} className="rounded-full text-white font-semibold" style={{ background: ringColor, padding: "20px 30px", fontSize: 15 }}>
                  일시정지
                </button>
              ) : (
                <button
                  onClick={() => (status === "paused" ? resume() : start(label))}
                  className="rounded-full text-white font-semibold"
                  style={{ background: P.green, padding: "20px 30px", fontSize: 15 }}
                >
                  시작
                </button>
              )}

              <button onClick={skip} disabled={status === "idle"} className="flex flex-col items-center gap-1">
                <span
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 44, height: 44, border: `1px solid ${P.line}`, fontSize: 18, color: status === "idle" ? P.line : P.faint }}
                >
                  ⏭
                </span>
                <span className="text-[11px] font-medium" style={{ color: status === "idle" ? P.line : P.faint }}>휴식으로</span>
              </button>
            </div>

            {/* 오늘 완료 세션 */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: DOT_CAP }, (_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: i < Math.min(todayCount, DOT_CAP) ? P.green : P.line,
                    }}
                  />
                ))}
              </div>
              <span className="text-xs font-medium" style={{ color: P.faint }}>{todayCount}회</span>
            </div>

            {/* 시간 설정 */}
            <div className="rounded-xl p-3 flex items-center justify-center gap-4" style={{ background: P.paper }}>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: P.faint }}>
                집중
                <input
                  type="number" min={1} max={90} value={settings.focusMin} disabled={status !== "idle"}
                  onChange={(e) => setFocusMin(+e.target.value)}
                  className="w-12 px-1.5 py-1 rounded-md text-sm text-center"
                  style={{ background: P.card, border: `1px solid ${P.line}`, opacity: status !== "idle" ? 0.5 : 1 }}
                />분
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: P.faint }}>
                휴식
                <input
                  type="number" min={1} max={60} value={settings.breakMin} disabled={status !== "idle"}
                  onChange={(e) => setBreakMin(+e.target.value)}
                  className="w-12 px-1.5 py-1 rounded-md text-sm text-center"
                  style={{ background: P.card, border: `1px solid ${P.line}`, opacity: status !== "idle" ? 0.5 : 1 }}
                />분
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
