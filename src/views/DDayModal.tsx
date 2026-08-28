import { useState } from "react";
import { P, DDay, loadVisibleDDays, removeDDay, getDDayCount, isDDaySoon } from "../lib";
import { hasGoogleConfig, deleteEvent } from "../gcal";
import DDayFormModal from "./DDayFormModal";

interface Props {
  gSignedIn: boolean;
  onGSignedInChange: (v: boolean) => void;
  onClose: () => void;
  onChanged: () => void; // 요약카드 등 다른 곳도 다시 읽도록 알림
}

const NEAR_COLOR = "#E8724C";

export default function DDayModal({ gSignedIn, onGSignedInChange, onClose, onChanged }: Props) {
  // 지난 D-Day는 목록에서 숨긴다(표시용 필터) — 삭제·구글연동은 원본 데이터 기준으로 계속 동작
  const [list, setList] = useState<DDay[]>(() => loadVisibleDDays());
  const [showForm, setShowForm] = useState(false);

  const refresh = () => {
    setList(loadVisibleDDays());
    onChanged();
  };

  const remove = async (dday: DDay) => {
    removeDDay(dday.id);
    refresh();
    if (dday.googleEventId && hasGoogleConfig() && gSignedIn) {
      try {
        await deleteEvent(dday.googleEventId);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_SIGNED_IN") onGSignedInChange(false);
        // 구글 쪽 삭제가 실패해도 로컬은 이미 지워졌으므로 조용히 넘어감
      }
    }
  };

  const formatDate = (date: string) => date.replace(/-/g, ". ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: P.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>디데이</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowForm(true)}
              className="text-xs px-3 py-1.5 rounded-full font-semibold text-white"
              style={{ background: P.green }}>
              + 추가
            </button>
            <button onClick={onClose} className="text-lg px-1" style={{ color: P.faint }} aria-label="닫기">✕</button>
          </div>
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: P.faint }}>아직 D-Day가 없어. 위에서 추가해봐.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {list.map((d) => {
              const soon = isDDaySoon(d.date);
              return (
                <li key={d.id} className="card flex items-center gap-3 relative"
                  style={{ padding: "14px 16px", borderLeft: `4px solid ${d.color}` }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ fontSize: 15 }}>{d.title}</p>
                    <p style={{ fontSize: 12, color: P.faint }}>{formatDate(d.date)}</p>
                  </div>
                  <span className="font-semibold shrink-0" style={{ fontSize: 18, color: soon ? NEAR_COLOR : P.faint }}>
                    {getDDayCount(d.date)}
                  </span>
                  <button onClick={() => remove(d)}
                    className="shrink-0 text-sm px-1 ml-1"
                    style={{ color: P.faint }} aria-label="삭제">✕</button>
                </li>
              );
            })}
          </ul>
        )}

        {showForm && (
          <DDayFormModal
            gSignedIn={gSignedIn}
            onGSignedInChange={onGSignedInChange}
            onClose={() => setShowForm(false)}
            onSaved={refresh}
          />
        )}
      </div>
    </div>
  );
}
