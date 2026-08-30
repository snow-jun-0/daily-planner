import { useEffect, useMemo, useState } from "react";
import YearView from "./views/YearView";
import YearPickerView from "./views/YearPickerView";
import MonthView from "./views/MonthView";
import DayView from "./views/DayView";
import StatsView from "./views/StatsView";
import SettingsModal from "./views/SettingsModal";
import RecurringModal from "./views/RecurringModal";
import TodosModal from "./views/TodosModal";
import HabitModal from "./views/HabitModal";
import TimerModal from "./views/TimerModal";
import DDayModal from "./views/DDayModal";
import MemoView from "./views/MemoView";
import SettingsView from "./views/SettingsView";
import BottomTabBar, { TabAction, TabKey } from "./views/BottomTabBar";
import {
  P, dateKey, loadDay, DDay, loadDDays, loadVisibleDDays, saveDDays, getDDayCount, isDDaySoon, DDAY_COLORS,
  getNotifyDaily, wasDailyReflectionFiredToday, markDailyReflectionFired,
} from "./lib";
import { hasGoogleConfig, isSignedIn, signInGoogle, signOutGoogle, hasExpiredToken, listDDayEvents, isAllDayEvent } from "./gcal";
import { usePomodoro } from "./pomodoro";

type View = "year" | "yearpicker" | "month" | "day" | "stats" | "memo" | "settings";

const DOW_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export default function App() {
  const today = new Date();
  const [view, setView] = useState<View>("day");
  const [showSettings, setShowSettings] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [showHabits, setShowHabits] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showDDays, setShowDDays] = useState(false);
  const [recurringVersion, setRecurringVersion] = useState(0);
  const [habitsVersion, setHabitsVersion] = useState(0);
  const [ddaysVersion, setDdaysVersion] = useState(0);
  const pomodoro = usePomodoro();

  const startFocusFor = (title: string) => {
    pomodoro.start(title);
    setShowTimer(true);
  };
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [day, setDay] = useState(today.getDate());

  const [gSignedIn, setGSignedIn] = useState(isSignedIn());
  const [gBusy, setGBusy] = useState(false);

  // 오늘 요약카드의 완료율 — 일간 뷰에서 할 일이 바뀔 때마다 DayView가 보고해줌
  const [todayProgress, setTodayProgress] = useState(() => {
    const d = loadDay(dateKey(year, month, day));
    return { done: d.tasks.filter((t) => t.done).length, total: d.tasks.length };
  });
  const handleTasksProgressChange = (done: number, total: number) => {
    setTodayProgress((prev) => (prev.done === done && prev.total === total ? prev : { done, total }));
  };

  // 구글 캘린더 → 로컬 D-Day 역동기화: 다른 기기에서 만든(plannerDDayId가 있는) 종일 이벤트를 로컬에 없으면 추가
  useEffect(() => {
    if (!hasGoogleConfig() || !gSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const events = await listDDayEvents();
        if (cancelled) return;
        const local = loadDDays();
        const localGoogleIds = new Set(local.map((d) => d.googleEventId).filter(Boolean));
        const localIds = new Set(local.map((d) => d.id));
        const toAdd: DDay[] = [];
        for (const ev of events) {
          if (!isAllDayEvent(ev)) continue;
          const plannerDDayId = ev.extendedProperties?.private?.plannerDDayId;
          if (!plannerDDayId || localIds.has(plannerDDayId) || localGoogleIds.has(ev.id)) continue;
          toAdd.push({
            id: plannerDDayId,
            title: ev.summary || "(제목 없음)",
            date: ev.start.date as string,
            color: DDAY_COLORS[0],
            googleEventId: ev.id,
          });
        }
        if (toAdd.length > 0) {
          saveDDays([...local, ...toAdd]);
          setDdaysVersion((v) => v + 1);
        }
      } catch (e) {
        if (!cancelled && e instanceof Error && e.message === "NOT_SIGNED_IN") setGSignedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gSignedIn]);

  // 저녁 회고 알림 — 앱이 열려 있는 동안 30초마다 시각을 확인해 21:00에 한 번만 알림을 띄운다.
  // (탭을 닫으면 동작하지 않음 — 진짜 백그라운드 알림은 Service Worker 기반 스케줄링이 필요해 TODO로 남김)
  useEffect(() => {
    const REFLECT_HOUR = 21;
    const check = () => {
      if (!getNotifyDaily()) return;
      const now = new Date();
      if (now.getHours() !== REFLECT_HOUR || now.getMinutes() !== 0) return;
      const todayStr = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
      if (wasDailyReflectionFiredToday(todayStr)) return;
      markDailyReflectionFired(todayStr);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("오늘 하루를 기록해보세요", { body: "할 일과 메모를 정리하며 하루를 마무리해봐" });
        } catch {
          // 알림 실패는 무시 — 다음 기회(내일)에 다시 시도됨
        }
      }
    };
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, []);

  // 요약카드에는 지난 D-Day는 숨기고(표시용 필터), 데이터 자체는 그대로 둔다.
  const ddays = useMemo(() => loadVisibleDDays(), [ddaysVersion]);
  const visibleDDays = ddays.slice(0, 2);
  const moreDDaysCount = ddays.length - visibleDDays.length;

  const connectGoogle = async () => {
    setGBusy(true);
    try {
      await signInGoogle();
      setGSignedIn(true);
    } catch {
      // DayView가 개별 요청 실패 시 별도 안내를 보여주므로 여기서는 상태만 유지
    } finally {
      setGBusy(false);
    }
  };

  const disconnectGoogle = () => {
    signOutGoogle();
    setGSignedIn(false);
  };

  const gotoDate = (y: number, m: number, d: number) => {
    setYear(y);
    setMonth(m);
    setDay(d);
    setView("day");
  };

  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setDay(t.getDate());
    setView("day");
  };

  // 하단 탭바 — 활성 탭 표시(showTimer가 열려있으면 그게 우선)
  const activeTab: TabKey | null =
    showTimer ? "timer"
    : view === "day" ? "today"
    : view === "month" || view === "year" || view === "yearpicker" ? "month"
    : view === "memo" ? "memo"
    : view === "settings" ? "settings"
    : null; // stats 등 매칭되는 탭이 없는 화면 → 어느 탭도 활성 아님

  const handleTabSelect = (action: TabAction) => {
    if (action === "timer") {
      setShowTimer(true);
      return;
    }
    setShowTimer(false);
    setView(action);
  };

  const headerDow = new Date(year, month, day).getDay();
  const isViewingToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
  const todayPct = todayProgress.total ? Math.round((todayProgress.done / todayProgress.total) * 100) : 0;
  const RING_R = 23.5; // 지름 52px, 굵기 5px 기준
  const RING_CIRC = 2 * Math.PI * RING_R;
  const RING_DASH = (todayPct / 100) * RING_CIRC;

  return (
    <div className="min-h-screen">
      <div
        className="max-w-5xl mx-auto px-4 sm:px-6 py-6"
        style={{ paddingBottom: "calc(78px + env(safe-area-inset-bottom))" }}
      >
        {/* 상단 헤더 — 왼쪽 요일·월/날짜, 오른쪽 오늘 칩. 일간뷰 전용(월간뷰는 자체 헤더 사용) */}
        {view === "day" && (
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="uppercase" style={{ fontSize: 11, color: P.faint, letterSpacing: "1.5px", fontWeight: 500 }}>
                {DOW_EN[headerDow]} · {month + 1}월
              </p>
              <p style={{ fontFamily: "'Gowun Batang', serif", fontSize: 28, color: P.ink, fontWeight: 700, lineHeight: 1.2 }}>
                {month + 1}월 {day}일
              </p>
            </div>
            {!isViewingToday && (
              <button onClick={goToday}
                className="text-sm font-semibold text-white shrink-0"
                style={{ background: P.green, borderRadius: 20, padding: "7px 13px", boxShadow: "0 2px 6px rgba(33,48,41,0.18)" }}>
                오늘로
              </button>
            )}
          </div>
        )}

        {/* 오늘 요약카드 — 왼쪽 원형 진행률 + 완료 텍스트, 오른쪽 D-Day 리스트(가까운 순 2개). 일간뷰 전용 */}
        {view === "day" && (
          <div className="flex items-center gap-4 mb-4 sm:mb-6"
            style={{ background: "linear-gradient(to right, #2E6B4F, #21523D)", borderRadius: 18, padding: "16px 18px", boxShadow: "0 4px 14px rgba(33,48,41,0.2)" }}>
            <div className="relative shrink-0" style={{ width: 52, height: 52 }}>
              <svg width={52} height={52} viewBox="0 0 52 52">
                <circle cx={26} cy={26} r={RING_R} fill="none" stroke="#3D7259" strokeWidth={5} />
                <circle cx={26} cy={26} r={RING_R} fill="none" stroke={P.highlight} strokeWidth={5}
                  strokeDasharray={`${RING_DASH} ${RING_CIRC}`} strokeLinecap="round"
                  transform="rotate(-90 26 26)" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-white font-semibold" style={{ fontSize: 13 }}>
                {todayPct}%
              </div>
            </div>
            <p className="min-w-0 text-white font-semibold" style={{ fontSize: 15, flex: "1 1 auto", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {todayProgress.total > 0
                ? `오늘 할 일 ${todayProgress.done}/${todayProgress.total} 완료`
                : "할 일 없음"}
            </p>

            <button
              onClick={() => setShowDDays(true)}
              className="flex flex-col gap-1 shrink-0 text-left rounded-lg transition-opacity hover:opacity-80 active:opacity-60"
              style={{ width: "clamp(120px, 34vw, 150px)" }}
              aria-label="D-Day 전체보기"
              title="D-Day 전체보기"
            >
              {ddays.length === 0 ? (
                <span style={{ fontSize: 11, color: "#ffffff88", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", width: "100%" }}>
                  D-Day를 추가해보세요
                </span>
              ) : (
                <>
                  {visibleDDays.map((d) => (
                    <div key={d.id} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="flex-1 min-w-0 truncate text-white" style={{ fontSize: 13 }}>{d.title}</span>
                      <span className="shrink-0 font-semibold" style={{ fontSize: 13, color: isDDaySoon(d.date) ? P.highlight : "#fff" }}>
                        {getDDayCount(d.date)}
                      </span>
                    </div>
                  ))}
                  {moreDDaysCount > 0 && (
                    <span style={{ fontSize: 11, color: "#ffffff99" }}>
                      +{moreDDaysCount}개 더보기
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        )}

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {showRecurring && (
          <RecurringModal
            gSignedIn={gSignedIn}
            onGSignedInChange={setGSignedIn}
            onClose={() => setShowRecurring(false)}
            onChanged={() => setRecurringVersion((v) => v + 1)}
          />
        )}
        {showTodos && (
          <TodosModal
            gSignedIn={gSignedIn}
            onGSignedInChange={setGSignedIn}
            onClose={() => setShowTodos(false)}
            onSelectDate={gotoDate}
          />
        )}
        {showHabits && (
          <HabitModal
            onClose={() => setShowHabits(false)}
            onChanged={() => setHabitsVersion((v) => v + 1)}
          />
        )}
        {showTimer && <TimerModal api={pomodoro} onClose={() => setShowTimer(false)} />}
        {showDDays && (
          <DDayModal
            gSignedIn={gSignedIn}
            onGSignedInChange={setGSignedIn}
            onClose={() => setShowDDays(false)}
            onChanged={() => setDdaysVersion((v) => v + 1)}
          />
        )}

        {view === "year" && (
          <YearView
            year={year}
            onChangeYear={setYear}
            onSelectMonth={(m) => { setMonth(m); setView("month"); }}
          />
        )}
        {view === "yearpicker" && (
          <YearPickerView
            year={year}
            onSelectYear={(y) => { setYear(y); setView("month"); }}
            onBack={() => setView("month")}
          />
        )}
        {view === "month" && (
          <MonthView
            year={year}
            month={month}
            habitsVersion={habitsVersion}
            gSignedIn={gSignedIn}
            onGSignedInChange={setGSignedIn}
            onBackToYear={() => setView("year")}
            onOpenYearPicker={() => setView("yearpicker")}
            onChangeMonth={(y, m) => { setYear(y); setMonth(m); }}
            onSelectDay={(d) => { setDay(d); setView("day"); }}
            onOpenStats={() => setView("stats")}
          />
        )}
        {view === "day" && (
          <DayView
            year={year}
            month={month}
            day={day}
            recurringVersion={recurringVersion}
            habitsVersion={habitsVersion}
            gSignedIn={gSignedIn}
            onGSignedInChange={setGSignedIn}
            onBack={() => setView("month")}
            onChangeDay={(y, m, d) => { setYear(y); setMonth(m); setDay(d); }}
            onStartFocus={startFocusFor}
            onTasksProgressChange={handleTasksProgressChange}
            onOpenRecurring={() => setShowRecurring(true)}
            onOpenTodos={() => setShowTodos(true)}
          />
        )}
        {view === "stats" && (
          <StatsView onBack={() => setView("month")} onOpenHabits={() => setShowHabits(true)} />
        )}
        {view === "memo" && <MemoView onSelectDate={gotoDate} />}
        {view === "settings" && (
          <SettingsView
            gSignedIn={gSignedIn}
            gBusy={gBusy}
            gTokenExpired={!gSignedIn && hasExpiredToken()}
            onConnectGoogle={connectGoogle}
            onDisconnectGoogle={disconnectGoogle}
            onOpenBackup={() => setShowSettings(true)}
          />
        )}
      </div>

      <BottomTabBar activeTab={activeTab} onSelect={handleTabSelect} />
    </div>
  );
}
