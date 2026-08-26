import { P } from "../lib";

interface Props {
  icon: string;
  label: string;
  onClick: () => void;
  title?: string;
}

/** 카드 헤더에 붙는 작은 진입 버튼 (연한 회색 고스트 스타일) — 반복/전체 등 */
export default function GhostButton({ icon, label, onClick, title }: Props) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 shrink-0"
      style={{ background: P.paper, borderRadius: 8, padding: "5px 10px", fontSize: 11, color: P.faint }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
