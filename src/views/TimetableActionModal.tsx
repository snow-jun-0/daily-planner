import { P, minutesToLabel } from "../lib";

interface Props {
  title: string;
  start: number;
  end: number;
  kind: "block" | "google" | "recurring"; // 앱 블록 / 구글 일정 / 반복 인스턴스
  onStartFocus: () => void; // 이 일정 길이만큼 집중 타이머 시작
  onDelete: () => void; // 삭제 (반복 인스턴스에서는 호출되지 않음)
  onClose: () => void;
}

/** 시간표 일정 블록을 탭하면 뜨는 작은 액션 시트 — 타이머 시작 / 삭제.
 *  스타일은 ConfirmModal·TimeBlockFormModal과 통일(오버레이/radius/다크모드 변수). */
export default function TimetableActionModal({
  title, start, end, kind, onStartFocus, onDelete, onClose,
}: Props) {
  const durationMin = end - start;
  const kindLabel = kind === "recurring" ? " · 반복 일정" : kind === "google" ? " · 구글 일정" : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "#22302A88" }}
      onClick={onClose}
    >
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="text-lg font-bold leading-snug break-keep" style={{ fontFamily: "'Gowun Batang', serif" }}>
            {title}
          </h2>
          <button onClick={onClose} className="text-lg px-2 shrink-0" style={{ color: P.faint }} aria-label="닫기">✕</button>
        </div>
        <p className="text-sm mb-5" style={{ color: P.faint }}>
          {minutesToLabel(start)} ~ {minutesToLabel(end)}{kindLabel}
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => { onStartFocus(); onClose(); }}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: P.green }}
          >
            타이머 시작 ({durationMin}분)
          </button>

          {kind === "recurring" ? (
            <p className="text-xs text-center py-2 leading-relaxed" style={{ color: P.faint }}>
              반복 일정은 '반복'에서 관리하세요
            </p>
          ) : (
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="w-full py-2.5 rounded-lg text-sm font-semibold"
              style={{ color: P.red, border: `1px solid ${P.line}` }}
            >
              삭제
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg text-sm font-medium"
            style={{ color: P.faint, border: `1px solid ${P.line}` }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
