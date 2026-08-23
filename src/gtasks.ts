// ---------- 구글 할 일(Google Tasks) 연동 ----------
// gcal.ts가 관리하는 OAuth 토큰(캘린더 스코프와 함께 tasks 스코프도 요청함)을 그대로 재사용한다.
// 구 토큰(재로그인 전)에는 tasks 스코프가 없을 수 있으므로, hasTasksScope()가 false면
// 아무 요청도 보내지 않고 조용히 빈 목록을 반환해 캘린더 기능에는 영향을 주지 않는다.

import { getStoredToken, hasTasksScope } from "./gcal";

const API_BASE = "https://tasks.googleapis.com/tasks/v1";

export interface GTask {
  id: string;
  taskListId: string;
  taskListTitle: string;
  title: string;
  due?: string; // RFC3339 (날짜만 의미 있음, 시각은 00:00:00Z로 고정되어 옴)
}

interface GTaskList {
  id: string;
  title: string;
}

/** 여러 task list에 걸친 할 일을 React key 등에서 구분하기 위한 고유 키 */
export function gTaskUid(t: GTask): string {
  return `${t.taskListId}:${t.id}`;
}

async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const token = getStoredToken();
  if (!token) throw new Error("NOT_SIGNED_IN");

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    // calendar.ts의 apiFetch와 달리 여기서는 토큰 자체를 지우지 않는다.
    // 토큰이 캘린더 스코프까지 함께 담고 있어, 지우면 캘린더 연결까지 끊어지기 때문.
    throw new Error("NOT_SIGNED_IN");
  }
  if (res.status === 403) {
    // 스코프 부족(구 토큰) 등으로 권한이 없는 경우. 할 일 기능만 비활성화하고 넘어간다.
    throw new Error("NO_TASKS_SCOPE");
  }
  if (!res.ok) {
    throw new Error(`구글 할 일 요청 실패 (${res.status}): ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function listTaskLists(): Promise<GTaskList[]> {
  const data = await apiFetch(`/users/@me/lists?maxResults=100`);
  const items = (data?.items ?? []) as any[];
  return items.map((l) => ({ id: l.id as string, title: (l.title as string) ?? l.id }));
}

async function listIncompleteTasksForList(list: GTaskList): Promise<GTask[]> {
  const params = new URLSearchParams({ showCompleted: "false", showHidden: "false", maxResults: "100" });
  const data = await apiFetch(`/lists/${encodeURIComponent(list.id)}/tasks?${params.toString()}`);
  const items = (data?.items ?? []) as any[];
  return items
    .filter((t) => t.status !== "completed")
    .map((t) => ({
      id: t.id as string,
      taskListId: list.id,
      taskListTitle: list.title,
      title: (t.title as string) || "(제목 없음)",
      due: t.due as string | undefined,
    }));
}

/**
 * 모든 task list의 미완료 할 일을 병합해 반환한다.
 * 로그인 안 됐거나(NOT_SIGNED_IN) tasks 스코프가 없으면(NO_TASKS_SCOPE) 그대로 예외를 던져
 * 호출부가 각 상황에 맞게 처리할 수 있게 하고, 개별 리스트 조회 실패는 조용히 건너뛴다.
 */
export async function listAllIncompleteGTasks(): Promise<GTask[]> {
  if (!hasTasksScope()) return [];
  const lists = await listTaskLists();
  const results = await Promise.all(
    lists.map(async (l) => {
      try {
        return await listIncompleteTasksForList(l);
      } catch (e) {
        if (e instanceof Error && (e.message === "NOT_SIGNED_IN" || e.message === "NO_TASKS_SCOPE")) throw e;
        console.warn(`[gtasks] 리스트(${l.title}) 할 일 조회 실패`, e);
        return [] as GTask[];
      }
    })
  );
  return results.flat();
}

/** 할 일을 완료 처리 (앱 → 구글, 양방향 동기화용) */
export async function completeGTask(taskListId: string, taskId: string): Promise<void> {
  await apiFetch(`/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "completed" }),
  });
}
