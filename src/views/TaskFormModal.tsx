import { useState } from "react";
import { P, PRIORITIES, Priority } from "../lib";

interface Props {
  onClose: () => void;
  onAdd: (text: string, priority: Priority) => void;
}

export default function TaskFormModal({ onClose, onAdd }: Props) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<Priority>("mid");

  const canSave = text.trim().length > 0;

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed, priority);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>할 일 추가</h2>
          <button onClick={onClose} className="text-lg px-2" style={{ color: P.faint }} aria-label="닫기">✕</button>
        </div>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="할 일 이름"
          className="w-full px-3 py-2.5 rounded-lg text-sm mb-3"
          style={{ background: P.paper, border: `1px solid ${P.line}` }}
          autoFocus
        />

        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs" style={{ color: P.faint }}>우선순위</span>
          {PRIORITIES.map((p) => (
            <button key={p.id} onClick={() => setPriority(p.id)}
              className="px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: priority === p.id ? p.bg : "transparent",
                color: priority === p.id ? p.color : P.faint,
                border: `1px solid ${priority === p.id ? p.color : P.line}`,
              }}>
              {p.label}
            </button>
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
