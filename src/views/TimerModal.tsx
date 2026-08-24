import { useEffect } from "react";
import { P } from "../lib";
import { PomodoroApi, formatMs } from "../pomodoro";

interface Props {
  api: PomodoroApi;
  onClose: () => void;
}

const SIZE = 240;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export default function TimerModal({ api, onClose }: Props) {
  const {
    phase, status, label, remainingMs, durationMs, settings, todayCount, justCompleted,
    start, pause, resume, reset, skip, updateSettings, clearJustCompleted,
  } = api;

  // 완료 배너는 몇 초 뒤 자동으로 사라짐
  useEffect(() => {
    if (!justCompleted) return;
    const t = setTimeout(clearJustCompleted, 4000);
    return () => clearTimeout(t);
  }, [justCompleted, clearJustCompleted]);

  const progress = durationMs > 0 ? Math.min(1, Math.max(0, remainingMs / durationMs)) : 0;
  const ringColor = phase === "focus" ? P.green : P.sage;
  const offset = CIRC * (1 - progress);

  const phaseLabel =
    status === "idle" ? "대기 중" : status === "paused" ? "일시정지" : phase === "focus" ? "집중 중" : "휴식 중";

  const setFocusMin = (v: number) => updateSettings({ ...settings, focusMin: Math.min(90, Math.max(1, v)) });
  const setBreakMin = (v: number) => updateSettings({ ...settings, breakMin: Math.min(60, Math.max(1, v)) });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>뽀모도로 타이머</h2>
          <button onClick={onClose} className="text-lg px-2" style={{ color: P.faint }} aria-label="닫기">✕</button>
        </div>
        <p className="text-xs mb-4" style={{ color: P.faint }}>
          {settings.focusMin}분 집중 + {settings.breakMin}분 휴식을 반복해봐.
        </p>

        {justCompleted && (
          <div className="text-xs text-center mb-4 px-3 py-2 rounded-lg font-medium" style={{ background: `${ringColor}22`, color: ringColor }}>
            {justCompleted.phase === "focus" ? "집중 끝! 잠깐 쉬어가자 🎉" : "휴식 끝! 다시 집중해볼까?"}
          </div>
        )}

        {label && (
          <p className="text-xs text-center mb-2 truncate" style={{ color: P.faint }}>
            🎯 {label}
          </p>
        )}

        {/* 원형 타이머 */}
        <div className="flex justify-center mb-5">
          <div className="relative w-56 h-56 sm:w-64 sm:h-64">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full -rotate-90">
              <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={P.line} strokeWidth={STROKE} />
              <circle
                cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none"
                stroke={ringColor} strokeWidth={STROKE} strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 0.3s linear, stroke 0.3s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl sm:text-5xl font-bold" style={{ fontVariantNumeric: "tabular-nums", color: P.ink }}>
                {formatMs(remainingMs)}
              </span>
              <span className="text-xs font-medium mt-1" style={{ color: ringColor }}>{phaseLabel}</span>
            </div>
          </div>
        </div>

        {/* 컨트롤 */}
        <div className="flex gap-2 mb-4">
          {status === "running" ? (
            <button onClick={pause} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: ringColor }}>
              일시정지
            </button>
          ) : status === "paused" ? (
            <button onClick={resume} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: ringColor }}>
              재개
            </button>
          ) : (
            <button onClick={() => start(label)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: P.green }}>
              시작
            </button>
          )}
          <button onClick={reset} className="px-4 py-2.5 rounded-lg text-sm font-medium" style={{ color: P.faint, border: `1px solid ${P.line}` }}>
            리셋
          </button>
          <button onClick={skip} disabled={status === "idle"} className="px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{ color: status === "idle" ? P.line : P.faint, border: `1px solid ${P.line}` }}>
            스킵
          </button>
        </div>

        {/* 오늘 완료 개수 */}
        <p className="text-xs text-center mb-4" style={{ color: P.faint }}>
          오늘 완료한 뽀모도로 <span className="font-semibold" style={{ color: P.green }}>🍅 {todayCount}</span>
        </p>

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
      </div>
    </div>
  );
}
