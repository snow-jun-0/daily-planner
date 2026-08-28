import { useState } from "react";
import { P, DDay, DDAY_COLORS, DAY_NAMES, uid, addDDay, setDDayGoogleEventId } from "../lib";
import { hasGoogleConfig, createDDayEvent } from "../gcal";
import MiniCalendar from "./MiniCalendar";

interface Props {
  gSignedIn: boolean;
  onGSignedInChange: (v: boolean) => void;
  onClose: () => void;
  onSaved: () => void; // 로컬 저장(및 구글 동기화) 시마다 호출 — 부모가 목록을 다시 읽도록
}

export default function DDayFormModal({ gSignedIn, onGSignedInChange, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [color, setColor] = useState(DDAY_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [showCal, setShowCal] = useState(false);

  const fmtDate = (v: string) => {
    const dt = new Date(`${v}T00:00:00`);
    return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DAY_NAMES[dt.getDay()]})`;
  };

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed || !date || saving) return;
    setSaving(true);

    const dday: DDay = { id: uid(), title: trimmed, date, color };
    addDDay(dday);
    onSaved();

    if (hasGoogleConfig() && gSignedIn) {
      try {
        const ev = await createDDayEvent(date, trimmed, dday.id);
        setDDayGoogleEventId(dday.id, ev.id);
        onSaved();
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_SIGNED_IN") onGSignedInChange(false);
        // 구글 등록에 실패해도 로컬에는 이미 저장됐으므로 조용히 넘어감
      }
    }

    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>D-Day 추가</h2>
          <button onClick={onClose} className="text-lg px-2" style={{ color: P.faint }} aria-label="닫기">✕</button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="이름 (예: 기말고사)"
          className="w-full px-3 py-2.5 rounded-lg text-sm mb-3"
          style={{ background: P.paper, border: `1px solid ${P.line}` }}
        />
        <div className="relative mb-3">
          <button
            type="button"
            onClick={() => setShowCal((v) => !v)}
            className="w-full px-3 py-2.5 rounded-lg text-sm text-left"
            style={{
              background: P.paper,
              border: `1px solid ${showCal ? P.green : P.line}`,
              color: date ? P.ink : P.faint,
            }}
          >
            {date ? fmtDate(date) : "날짜 선택"}
          </button>
          {showCal && (
            <>
              <div className="fixed inset-0 z-[65]" onClick={() => setShowCal(false)} />
              <div className="absolute left-0 right-0 top-full mt-1 z-[66]">
                <MiniCalendar value={date} onChange={(v) => { setDate(v); setShowCal(false); }} />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs" style={{ color: P.faint }}>색상</span>
          {DDAY_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-6 h-6 rounded-full transition-transform"
              style={{ background: c, transform: color === c ? "scale(1.2)" : "scale(1)", boxShadow: color === c ? `0 0 0 2px ${P.card}, 0 0 0 4px ${c}` : "none" }}
              aria-label={`색상 ${c}`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ color: P.faint, border: `1px solid ${P.line}` }}>
            취소
          </button>
          <button onClick={save} disabled={!title.trim() || !date || saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: P.green, opacity: !title.trim() || !date ? 0.5 : 1 }}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
