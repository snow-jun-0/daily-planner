import { P } from "../lib";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // 삭제 등 파괴적 동작이면 확인 버튼을 빨강 계열로
  onConfirm: () => void;
  onClose: () => void;
}

/** 앱 스타일 확인 모달 — window.confirm 대체용. (오버레이/radius/다크모드 변수는 다른 팝업과 통일) */
export default function ConfirmModal({
  title, message, confirmLabel = "확인", cancelLabel = "취소", danger = false, onConfirm, onClose,
}: Props) {
  const confirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-2" style={{ fontFamily: "'Gowun Batang', serif" }}>{title}</h2>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: P.faint }}>{message}</p>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ color: P.faint, border: `1px solid ${P.line}` }}>
            {cancelLabel}
          </button>
          <button onClick={confirm}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: danger ? P.red : P.green }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
