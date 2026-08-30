// ---------- 할 일 ↔ 구글 Tasks 양방향 동기화 (얇은 헬퍼) ----------
// - 앱 → 구글: 액션 지점(추가/완료/삭제)에서 즉시 push. 실패해도 로컬은 유지.
// - 구글 → 앱: 로그인 시 runReverseSync() 한 번. 구글 상태를 done의 기준으로 삼는다.
// 미로그인 / tasks 스코프 없음이면 모든 push 헬퍼는 즉시 no-op (D-Day 방식의 graceful).

import { hasGoogleConfig, isSignedIn, hasTasksScope } from "./gcal";
import {
  Task,
  dueFromDateKey,
  reconcileGoogleTasks,
  linkTaskToGoogle,
} from "./lib";
import {
  DEFAULT_TASKLIST,
  insertGTask,
  deleteGTask,
  setGTaskStatus,
  listAllGTasks,
} from "./gtasks";

function canSync(): boolean {
  return hasGoogleConfig() && isSignedIn() && hasTasksScope();
}

/** 앱에서 할 일을 추가했을 때: 구글 Tasks(@default)에 생성하고 링크를 로컬에 저장 */
export async function pushTaskCreate(dateKey: string, task: Task): Promise<void> {
  if (!canSync()) return;
  try {
    const g = await insertGTask(DEFAULT_TASKLIST, {
      title: task.text,
      due: dueFromDateKey(dateKey),
      notes: `[[planner:${task.id}]]`,
    });
    linkTaskToGoogle(dateKey, task.id, g.id, DEFAULT_TASKLIST);
  } catch (e) {
    console.warn("[taskSync] 구글 할 일 생성 실패 (로컬은 유지)", e);
  }
}

/** 앱에서 완료/완료취소했을 때: 연결된 구글 항목 상태도 맞춤 */
export async function pushTaskDone(task: Task, done: boolean): Promise<void> {
  if (!canSync() || !task.googleTaskId) return;
  try {
    await setGTaskStatus(task.googleTaskListId ?? DEFAULT_TASKLIST, task.googleTaskId, done);
  } catch (e) {
    console.warn("[taskSync] 구글 할 일 완료 상태 반영 실패", e);
  }
}

/** 앱에서 삭제했을 때: 연결된 구글 항목도 삭제 (확인 없이 바로) */
export async function pushTaskDelete(task: Task): Promise<void> {
  if (!canSync() || !task.googleTaskId) return;
  try {
    await deleteGTask(task.googleTaskListId ?? DEFAULT_TASKLIST, task.googleTaskId);
  } catch (e) {
    console.warn("[taskSync] 구글 할 일 삭제 실패", e);
  }
}

/**
 * 구글 → 앱 역동기화. 로그인 시 App에서 1회 호출.
 * NOT_SIGNED_IN / NO_TASKS_SCOPE는 그대로 던져 호출부가 처리하게 한다(D-Day와 동일).
 * @returns 로컬 스토어에 변경이 있었으면 true
 */
export async function runReverseSync(): Promise<boolean> {
  if (!canSync()) return false;
  const all = await listAllGTasks();
  return reconcileGoogleTasks(all);
}
