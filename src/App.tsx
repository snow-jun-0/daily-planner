import { useState } from "react";
import YearView from "./views/YearView";
import MonthView from "./views/MonthView";
import DayView from "./views/DayView";
import SettingsModal from "./views/SettingsModal";
import RecurringModal from "./views/RecurringModal";
import TodosModal from "./views/TodosModal";
import HabitModal from "./views/HabitModal";
import { P } from "./lib";
import { hasGoogleConfig, isSignedIn, signInGoogle, signOutGoogle } from "./gcal";

type View = "year" | "month" | "day";

export default function App() {
  const today = new Date();
  const [view, setView] = useState<View>("day");
  const [showSettings, setShowSettings] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [showHabits, setShowHabits] = useState(false);
  const [recurringVersion, setRecurringVersion] = useState(0);
  const [habitsVersion, setHabitsVersion] = useState(0);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [day, setDay] = useState(today.getDate());

  const [gSignedIn, setGSignedIn] = useState(isSignedIn());
  const [gBusy, setGBusy] = useState(false);

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

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* 상단 바 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b" style={{ borderColor: P.ink }}>
          <p className="text-xs tracking-widest font-medium" style={{ color: P.faint }}>
            DAILY PLANNER
          </p>
          <div className="flex gap-2 flex-wrap sm:justify-end">
            <button onClick={goToday}
              className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
              style={{ background: P.green }}>
              오늘
            </button>
            <button onClick={() => setShowRecurring(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ color: P.green, border: `1px solid ${P.green}` }}
              title="매주 반복되는 고정 일정 관리">
              ↻ 반복 일정
            </button>
            <button onClick={() => setShowTodos(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ color: P.green, border: `1px solid ${P.green}` }}
              title="모든 날짜의 완료하지 않은 할 일 모아보기">
              전체 할 일
            </button>
            <button onClick={() => setShowHabits(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ color: P.green, border: `1px solid ${P.green}` }}
              title="매일 반복하는 습관 관리">
              습관
            </button>
            {hasGoogleConfig() && (
              gSignedIn ? (
                <button onClick={disconnectGoogle} disabled={gBusy}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ color: P.faint, border: `1px solid ${P.line}` }}
                  title="구글 캘린더 연결 해제">
                  구글 해제
                </button>
              ) : (
                <button onClick={connectGoogle} disabled={gBusy}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ color: P.faint, border: `1px solid ${P.line}` }}
                  title="구글 캘린더 연결">
                  구글 연결
                </button>
              )
            )}
            <button onClick={() => setShowSettings(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ color: P.faint, border: `1px solid ${P.line}` }}
              title="백업 및 기기 간 동기화">
              백업·동기화
            </button>
          </div>
        </div>

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {showRecurring && (
          <RecurringModal
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

        {view === "year" && (
          <YearView
            year={year}
            onChangeYear={setYear}
            onSelectMonth={(m) => { setMonth(m); setView("month"); }}
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
            onChangeMonth={(y, m) => { setYear(y); setMonth(m); }}
            onSelectDay={(d) => { setDay(d); setView("day"); }}
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
          />
        )}
      </div>
    </div>
  );
}
