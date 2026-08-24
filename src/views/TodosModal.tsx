import { useEffect, useState } from "react";
import { P, PRIORITIES, MONTH_NAMES, DAY_NAMES, allIncompleteTasks, markTaskDone } from "../lib";
import { hasGoogleConfig, hasTasksScope } from "../gcal";
import { GTask, gTaskUid, listAllIncompleteGTasks, completeGTask } from "../gtasks";

const GOOGLE_BLUE = "#4285F4";

interface Props {
  gSignedIn: boolean;
  onGSignedInChange: (v: boolean) => void;
  onClose: () => void;
  onSelectDate: (y: number, m: number, d: number) => void;
}

export default function TodosModal({ gSignedIn, onGSignedInChange, onClose, onSelectDate }: Props) {
  const [items, setItems] = useState(() => allIncompleteTasks());
  const [gTasks, setGTasks] = useState<GTask[]>([]);
  const [gMsg, setGMsg] = useState("");
  const [gBusy, setGBusy] = useState<Set<string>>(new Set());
  const showGoogleHint = hasGoogleConfig() && gSignedIn && !hasTasksScope();
  console.log("[DEBUG][TodosModal] 렌더링 조건 체크 - hasGoogleConfig:", hasGoogleConfig(), "| gSignedIn:", gSignedIn, "| hasTasksScope:", hasTasksScope(), "| showGoogleHint:", showGoogleHint);

  useEffect(() => {
    console.log("[DEBUG][TodosModal] useEffect 실행 - hasGoogleConfig:", hasGoogleConfig(), "| gSignedIn:", gSignedIn);
    if (!hasGoogleConfig() || !gSignedIn) {
      console.log("[DEBUG][TodosModal] hasGoogleConfig() 또는 gSignedIn이 false라서 여기서 return, gTasks=[] 유지");
      setGTasks([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const tasks = await listAllIncompleteGTasks();
        console.log(`[DEBUG][TodosModal] listAllIncompleteGTasks() 결과 (${tasks.length}개):`, tasks);
        if (!cancelled) setGTasks(tasks);
      } catch (e) {
        if (cancelled) return;
        console.warn("[DEBUG][TodosModal] listAllIncompleteGTasks() 예외 발생:", e);
        if (e instanceof Error && e.message === "NOT_SIGNED_IN") {
          onGSignedInChange(false);
          setGTasks([]);
        } else if (e instanceof Error && e.message === "NO_TASKS_SCOPE") {
          setGTasks([]); // 스코프 없음 - 조용히 비활성화
        } else {
          setGMsg("구글 할 일을 불러오지 못했어");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gSignedIn]);

  const complete = (date: string, taskId: string) => {
    markTaskDone(date, taskId);
    setItems((p) => p.filter((it) => !(it.date === date && it.task.id === taskId)));
  };

  const completeGoogle = async (task: GTask) => {
    const key = gTaskUid(task);
    setGBusy((p) => new Set(p).add(key));
    try {
      await completeGTask(task.taskListId, task.id);
      setGTasks((p) => p.filter((t) => gTaskUid(t) !== key));
    } catch (e) {
      if (e instanceof Error && e.message === "NOT_SIGNED_IN") {
        onGSignedInChange(false);
        setGTasks([]);
      } else {
        setGMsg("구글 할 일 완료 처리에 실패했어");
      }
    } finally {
      setGBusy((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }
  };

  const goTo = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    onSelectDate(y, m - 1, d);
    onClose();
  };

  const formatDate = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return `${MONTH_NAMES[m - 1]} ${d}일 (${DAY_NAMES[dow]})`;
  };

  const sortedGTasks = [...gTasks].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  console.log(`[DEBUG][TodosModal] 렌더링 시점 gTasks state (${gTasks.length}개) - 이 목록이 비어있으면 위 useEffect 로그에서 어디서 끊겼는지 확인:`, gTasks);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>전체 할 일</h2>
          <button onClick={onClose} className="text-lg px-2" style={{ color: P.faint }} aria-label="닫기">✕</button>
        </div>
        <p className="text-xs mb-1" style={{ color: P.faint }}>
          모든 날짜의 완료하지 않은 할 일을 모아서 보여줘.
        </p>
        {showGoogleHint && (
          <p className="text-[11px] mb-4" style={{ color: P.faint }}>
            구글 할 일을 보려면 구글을 다시 연결해줘 (권한이 추가됐어).
          </p>
        )}
        {gMsg && (
          <p className="text-[11px] mb-4" style={{ color: P.red }}>{gMsg}</p>
        )}
        {!showGoogleHint && !gMsg && <div className="mb-5" />}

        {items.length === 0 && gTasks.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: P.faint }}>완료 안 한 할 일이 없어</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {items.map(({ date, task }) => {
                const p = PRIORITIES.find((x) => x.id === task.priority) ?? PRIORITIES[1];
                return (
                  <li key={`${date}-${task.id}`}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-lg group"
                    style={{ background: P.paper }}>
                    <button onClick={() => complete(date, task.id)}
                      aria-label="완료 표시"
                      className="w-5 h-5 rounded shrink-0 flex items-center justify-center text-xs font-bold"
                      style={{ border: `2px solid ${P.sage}`, background: "transparent" }}>
                    </button>
                    <button onClick={() => goTo(date)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm truncate" style={{ color: P.ink }}>{task.text}</p>
                      <p className="text-[10px]" style={{ color: P.faint }}>{formatDate(date)}</p>
                    </button>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: p.bg, color: p.color }}>
                      {p.label}
                    </span>
                  </li>
                );
              })}
            </ul>

            {sortedGTasks.length > 0 && (
              <>
                <div className="flex items-center gap-2 mt-5 mb-1.5">
                  <span className="text-[11px] font-semibold" style={{ color: P.faint }}>구글 할 일</span>
                  <div className="flex-1 h-px" style={{ background: P.line }} />
                </div>
                <ul className="flex flex-col gap-1.5">
                  {sortedGTasks.map((task) => {
                    const key = gTaskUid(task);
                    const busy = gBusy.has(key);
                    const dueDate = task.due?.slice(0, 10);
                    return (
                      <li key={key}
                        className="flex items-center gap-3 px-2 py-2.5 rounded-lg"
                        style={{ background: P.paper, opacity: busy ? 0.6 : 1 }}>
                        <button onClick={() => completeGoogle(task)}
                          disabled={busy}
                          aria-label="구글 할 일 완료 표시"
                          className="w-5 h-5 rounded shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ border: `2px solid ${GOOGLE_BLUE}`, background: "transparent" }}>
                        </button>
                        {dueDate ? (
                          <button onClick={() => goTo(dueDate)} className="flex-1 min-w-0 text-left">
                            <p className="text-sm truncate" style={{ color: P.ink }}>{task.title}</p>
                            <p className="text-[10px]" style={{ color: P.faint }}>{formatDate(dueDate)}</p>
                          </button>
                        ) : (
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-sm truncate" style={{ color: P.ink }}>{task.title}</p>
                            <p className="text-[10px]" style={{ color: P.faint }}>마감일 없음</p>
                          </div>
                        )}
                        <span className="text-[9px] w-4 h-4 rounded-full font-bold shrink-0 flex items-center justify-center text-white"
                          style={{ background: GOOGLE_BLUE }}
                          title={task.taskListTitle}>
                          G
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
