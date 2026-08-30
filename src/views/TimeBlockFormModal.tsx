import { useState } from "react";
import { P, BLOCK_COLORS, MINUTE_OPTIONS, START_MINUTE_OPTIONS, minutesToLabel } from "../lib";

interface Props {
  onClose: () => void;
  onAdd: (title: string, start: number, end: number, color: string) => void;
  // 시간표에서 드래그로 시간대를 이미 정한 경우 — 시간 select 대신 읽기 전용 텍스트로 표시
  fixedStart?: number;
  fixedEnd?: number;
}

export default function TimeBlockFormModal({ onClose, onAdd, fixedStart, fixedEnd }: Props) {
  const fixed = fixedStart != null && fixedEnd != null;
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(fixedStart ?? 540); // 09:00
  const [end, setEnd] = useState(fixedEnd ?? 600); // 10:00
  const [color, setColor] = useState(BLOCK_COLORS[0].color);

  const endOptions = MINUTE_OPTIONS.filter((m) => m > start);
  const onStartChange = (v: number) => {
    setStart(v);
    setEnd((prevEnd) => (prevEnd <= v ? v + 10 : prevEnd));
  };

  const canSave = title.trim().length > 0 && end > start;

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed || end <= start) return;
    onAdd(trimmed, start, end, color);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>일정 추가</h2>
          <button onClick={onClose} className="text-lg px-2" style={{ color: P.faint }} aria-label="닫기">✕</button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="일정 이름"
          className="w-full px-3 py-2.5 rounded-lg text-sm mb-3"
          style={{ background: P.paper, border: `1px solid ${P.line}` }}
          autoFocus
        />

        {fixed ? (
          <div className="mb-3 px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2"
            style={{ background: P.paper, border: `1px solid ${P.line}`, color: P.ink }}>
            {minutesToLabel(start)}
            <span style={{ color: P.faint }}>~</span>
            {minutesToLabel(end)}
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-3">
            <select value={start} onChange={(e) => onStartChange(+e.target.value)}
              className="flex-1 px-2 py-2 rounded-lg text-sm" style={{ background: P.paper, border: `1px solid ${P.line}` }}>
              {START_MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{minutesToLabel(m)}</option>)}
            </select>
            <span className="text-sm" style={{ color: P.faint }}>→</span>
            <select value={end} onChange={(e) => setEnd(+e.target.value)}
              className="flex-1 px-2 py-2 rounded-lg text-sm" style={{ background: P.paper, border: `1px solid ${P.line}` }}>
              {endOptions.map((m) => <option key={m} value={m}>{minutesToLabel(m)}</option>)}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs" style={{ color: P.faint }}>색상</span>
          {BLOCK_COLORS.map((c) => (
            <button
              key={c.color}
              onClick={() => setColor(c.color)}
              className="w-6 h-6 rounded-full transition-transform"
              style={{
                background: c.color,
                transform: color === c.color ? "scale(1.2)" : "scale(1)",
                boxShadow: color === c.color ? `0 0 0 2px ${P.card}, 0 0 0 4px ${c.color}` : "none",
              }}
              aria-label={`색상 ${c.name}`}
              title={c.name}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ color: P.faint, border: `1px solid ${P.line}` }}>
            취소
          </button>
          <button onClick={save} disabled={!canSave}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: P.green, opacity: canSave ? 1 : 0.5 }}>
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
