import { useEffect, useState } from "react";
import { P, PRIORITIES, MONTH_NAMES, DAY_NAMES, Priority, dateKey, allTasks, setTaskDone } from "../lib";
import { hasGoogleConfig, hasTasksScope } from "../gcal";
import { GTask, gTaskUid, listAllIncompleteGTasks, completeGTask } from "../gtasks";

const GOOGLE_BLUE = "#4285F4";

type FilterId = "todo" | "all" | "important";
const FILTERS: { id: FilterId; label: string }[] = [
  { id: "todo", label: "미완료" },
  { id: "all", label: "전체" },
  { id: "important", label: "중요만" },
];

interface Props {
  gSignedIn: boolean;
  onGSignedInChange: (v: boolean) => void;
  onClose: () => void;
  onSelectDate: (y: number, m: number, d: number) => void;
}

export default function TodosModal({ gSignedIn, onGSignedInChange, onClose, onSelectDate }: Props) {
  const [filter, setFilter] = useState<FilterId>("todo");
  const [items, setItems] = useState(() => allTasks());
  const [gTasks, setGTasks] = useState<GTask[]>([]);
  const [gMsg, setGMsg] = useState("");
  const [gBusy, setGBusy] = useState<Set<string>>(new Set());
  const showGoogleHint = hasGoogleConfig() && gSignedIn && !hasTasksScope();

  useEffect(() => {
    if (!hasGoogleConfig() || !gSignedIn) {
      setGTasks([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const tasks = await listAllIncompleteGTasks();
        if (!cancelled) setGTasks(tasks);
      } catch (e) {
        if (cancelled) return;
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

  // 로컬 할 일 완료 토글 — 저장 후 목록을 다시 읽어 필터에 반영
  const toggleLocal = (date: string, taskId: string, done: boolean) => {
    setTaskDone(date, taskId, !done);
    setItems(allTasks());
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

  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const groupLabel = (date: string) => (date === todayKey ? `오늘 · ${formatDate(date)}` : formatDate(date));

  const priorityOf = (p: Priority) => PRIORITIES.find((x) => x.id === p) ?? PRIORITIES[1];

  // ---------- 표시 시점 필터링 (데이터는 그대로) ----------
  const filteredItems = items.filter(({ task }) => {
    if (filter === "todo") return !task.done;
    if (filter === "important") return task.priority === "high" && !task.done;
    return true; // "all"
  });

  // 날짜별 그룹 (날짜 오름차순)
  const groups = new Map<string, typeof filteredItems>();
  for (const it of filteredItems) {
    const arr = groups.get(it.date) ?? [];
    arr.push(it);
    groups.set(it.date, arr);
  }
  const groupedDates = [...groups.keys()].sort();

  // 구글 할 일은 우선순위 개념이 없으므로 "중요만" 필터에서는 숨김
  const sortedGTasks =
    filter === "important"
      ? []
      : [...gTasks].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  const isEmpty = groupedDates.length === 0 && sortedGTasks.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#22302A88" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: P.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>전체 할 일</h2>
          <button onClick={onClose} className="text-lg px-2" style={{ color: P.faint }} aria-label="닫기">✕</button>
        </div>
        <p className="text-xs mb-3" style={{ color: P.faint }}>
          모든 날짜의 할 일을 모아서 보여줘.
        </p>

        <div className="flex gap-1.5 mb-3">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{
                  background: on ? P.green : "transparent",
                  color: on ? "#fff" : P.faint,
                  border: `1px solid ${on ? P.green : P.line}`,
                }}>
                {f.label}
              </button>
            );
          })}
        </div>

        {showGoogleHint && (
          <p className="text-[11px] mb-3" style={{ color: P.faint }}>
            구글 할 일을 보려면 구글을 다시 연결해줘 (권한이 추가됐어).
          </p>
        )}
        {gMsg && (
          <p className="text-[11px] mb-3" style={{ color: P.red }}>{gMsg}</p>
        )}

        {isEmpty ? (
          <p className="text-sm text-center py-8" style={{ color: P.faint }}>할 일이 없어요</p>
        ) : (
          <>
            {groupedDates.map((date, gi) => (
              <div key={date} style={{ marginTop: gi === 0 ? 0 : 16 }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-semibold" style={{ color: P.faint }}>{groupLabel(date)}</span>
                  <div className="flex-1 h-px" style={{ background: P.line }} />
                </div>
                <ul className="flex flex-col gap-1.5">
                  {groups.get(date)!.map(({ task }) => {
                    const p = priorityOf(task.priority);
                    return (
                      <li key={`${date}-${task.id}`}
                        className="flex items-center gap-3 px-2 py-2.5 rounded-lg"
                        style={{ background: P.paper }}>
                        <button onClick={() => toggleLocal(date, task.id, task.done)}
                          aria-label={task.done ? "완료 취소" : "완료 표시"}
                          className="w-5 h-5 rounded shrink-0 flex items-center justify-center text-xs font-bold"
                          style={{
                            border: `2px solid ${task.done ? P.green : P.sage}`,
                            background: task.done ? P.green : "transparent",
                            color: "#fff",
                          }}>
                          {task.done ? "✓" : ""}
                        </button>
                        <button onClick={() => goTo(date)} className="flex-1 min-w-0 text-left">
                          <p className="text-sm truncate"
                            style={{ color: task.done ? P.faint : P.ink, textDecoration: task.done ? "line-through" : "none" }}>
                            {task.text}
                          </p>
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
              </div>
            ))}

            {sortedGTasks.length > 0 && (
              <div style={{ marginTop: groupedDates.length === 0 ? 0 : 16 }}>
                <div className="flex items-center gap-2 mb-1.5">
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
