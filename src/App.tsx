import { useState } from "react";
import YearView from "./views/YearView";
import MonthView from "./views/MonthView";
import DayView from "./views/DayView";
import SettingsModal from "./views/SettingsModal";
import { P, downloadICS } from "./lib";

type View = "year" | "month" | "day";

export default function App() {
  const today = new Date();
  const [view, setView] = useState<View>("day");
  const [showSettings, setShowSettings] = useState(false);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [day, setDay] = useState(today.getDate());

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
        <div className="flex items-center justify-between mb-6 pb-4 border-b" style={{ borderColor: P.ink }}>
          <p className="text-xs tracking-widest font-medium" style={{ color: P.faint }}>
            DAILY PLANNER
          </p>
          <div className="flex gap-2">
            <button onClick={goToday}
              className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
              style={{ background: P.green }}>
              오늘
            </button>
            <button onClick={downloadICS}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ color: P.green, border: `1px solid ${P.green}` }}
              title="일정을 .ics 파일로 내보내서 구글/애플 캘린더에 추가">
              캘린더 내보내기
            </button>
            <button onClick={() => setShowSettings(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ color: P.faint, border: `1px solid ${P.line}` }}
              title="백업 및 기기 간 동기화">
              백업·동기화
            </button>
          </div>
        </div>

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

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
            onBack={() => setView("month")}
            onChangeDay={(y, m, d) => { setYear(y); setMonth(m); setDay(d); }}
          />
        )}
      </div>
    </div>
  );
}
