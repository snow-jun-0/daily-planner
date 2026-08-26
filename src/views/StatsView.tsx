import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { MONTH_NAMES, P, getMonthStats, MonthStats } from "../lib";
import { getMonthPomodoroStats } from "../pomodoro";
import GhostButton from "./GhostButton";

interface Props {
  onBack: () => void;
  onOpenHabits: () => void;
}

const BLUE = "#2C5AA0";
const ORANGE = "#D97706";

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="paper-card rounded-2xl p-4" style={{ background: P.card, border: `1px solid ${P.line}` }}>
      <p className="text-xs mb-1" style={{ color: P.faint }}>{label}</p>
      <p className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "'Gowun Batang', serif", color }}>
        {value}
      </p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: P.faint }}>{sub}</p>}
    </div>
  );
}

function SectionCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="paper-card rounded-2xl p-4 sm:p-5" style={{ background: P.card, border: `1px solid ${P.line}` }}>
      <h2 className="text-base font-bold mb-0.5" style={{ fontFamily: "'Gowun Batang', serif" }}>{title}</h2>
      {desc && <p className="text-xs mb-3" style={{ color: P.faint }}>{desc}</p>}
      {children}
    </div>
  );
}

function EmptyRow({ text = "아직 기록이 없어요" }: { text?: string }) {
  return <p className="text-sm text-center py-8" style={{ color: P.faint }}>{text}</p>;
}

function TooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs rounded-lg px-2.5 py-1.5" style={{ background: P.ink, color: P.card }}>
      {children}
    </div>
  );
}

function TaskTrendChart({ stats }: { stats: MonthStats }) {
  const data = stats.taskByDay.map((d) => ({ ...d, remaining: d.total - d.done }));
  if (stats.totalTasks === 0) return <EmptyRow />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={P.line} vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: P.faint }} interval={data.length > 20 ? 2 : 1} tickLine={false} axisLine={{ stroke: P.line }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: P.faint }} tickLine={false} axisLine={false} width={28} />
        <Tooltip
          cursor={{ fill: `${P.sage}22` }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof data)[number];
            return (
              <TooltipBox>
                {label}일 · 완료 {p.done}/{p.total}
              </TooltipBox>
            );
          }}
        />
        <Bar dataKey="done" stackId="t" name="완료" fill={P.green} radius={[3, 3, 0, 0]} />
        <Bar dataKey="remaining" stackId="t" name="미완료" fill={`${P.faint}55`} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function HabitRateList({ stats, onOpenHabits }: { stats: MonthStats; onOpenHabits: () => void }) {
  if (stats.habitStats.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm mb-3" style={{ color: P.faint }}>습관을 추가해보세요</p>
        <button
          onClick={onOpenHabits}
          className="text-sm font-semibold px-4 py-2 rounded-lg text-white"
          style={{ background: P.green }}
        >
          + 습관 추가
        </button>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3.5">
      {stats.habitStats.map(({ habit, rate, streak }) => (
        <li key={habit.id} className="flex items-center gap-2">
          <span className="text-sm font-medium truncate flex-1 min-w-0">
            {habit.emoji ? `${habit.emoji} ` : ""}{habit.name}
          </span>
          {streak > 0 && (
            <span className="text-xs font-semibold shrink-0" style={{ color: P.green }}>🔥{streak}</span>
          )}
          <span className="text-xs font-semibold shrink-0 w-9 text-right" style={{ color: P.ink }}>{rate}%</span>
          <div className="shrink-0 h-2 rounded-full overflow-hidden" style={{ width: 80, background: P.paper }}>
            <div className="h-full rounded-full" style={{ width: `${rate}%`, background: P.green }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function TimeOfDayChart({ stats }: { stats: MonthStats }) {
  if (stats.totalBlockMinutes === 0) return <EmptyRow text="이 달에 등록된 시간표 일정이 없어요" />;
  const data = stats.hourBuckets.map((b) => ({ ...b, hours: Math.round((b.minutes / 60) * 10) / 10 }));
  const totalH = Math.round((stats.totalBlockMinutes / 60) * 10) / 10;
  return (
    <div>
      <p className="text-xs mb-2" style={{ color: P.faint }}>이 달 총 등록 시간: <b style={{ color: P.green }}>{totalH}시간</b></p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={P.line} vertical={false} />
          <XAxis dataKey="hour" tickFormatter={(h) => `${h}시`} tick={{ fontSize: 10, fill: P.faint }} interval={1} tickLine={false} axisLine={{ stroke: P.line }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: P.faint }} tickLine={false} axisLine={false} width={28} />
          <Tooltip
            cursor={{ fill: `${P.sage}22` }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return <TooltipBox>{label}시 · {p.hours}시간</TooltipBox>;
            }}
          />
          <Bar dataKey="hours" fill={P.sage} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function StatsView({ onBack, onOpenHabits }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const stats = useMemo(() => getMonthStats(year, month), [year, month]);
  const pomodoroStats = useMemo(() => getMonthPomodoroStats(year, month), [year, month]);
  const focusHours = Math.round((pomodoroStats.minutes / 60) * 10) / 10;

  const prev = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1);
  };
  const next = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1);
  };

  const isEmpty =
    stats.recordedDays === 0 &&
    pomodoroStats.count === 0 &&
    stats.habitStats.every((h) => h.rate === 0 && h.streak === 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: P.faint, border: `1px solid ${P.line}` }}>
          ‹ 달력으로
        </button>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>통계</h1>
        <GhostButton icon="🔥" label="습관 관리" onClick={onOpenHabits} title="습관 추가·수정·삭제" />
      </div>

      <div className="flex items-center justify-center gap-5 mb-6">
        <button onClick={prev} className="text-2xl px-2" style={{ color: P.faint }} aria-label="이전 달">‹</button>
        <span className="text-base font-semibold" style={{ fontFamily: "'Gowun Batang', serif" }}>
          {year}년 <span style={{ color: P.green }}>{MONTH_NAMES[month]}</span>
        </span>
        <button onClick={next} className="text-2xl px-2" style={{ color: P.faint }} aria-label="다음 달">›</button>
      </div>

      {isEmpty ? (
        <div className="paper-card rounded-2xl p-10 text-center" style={{ background: P.card, border: `1px solid ${P.line}` }}>
          <p className="text-sm" style={{ color: P.faint }}>
            {year}년 {MONTH_NAMES[month]}에는 아직 기록이 없어요
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="할 일 완료율" value={`${stats.overallTaskRate}%`} sub={`${stats.totalDone}/${stats.totalTasks}건`} color={P.green} />
            <SummaryCard label="집중 시간" value={`${focusHours}h`} sub={pomodoroStats.count ? `뽀모도로 ${pomodoroStats.count}회` : undefined} color={BLUE} />
            <SummaryCard label="기록한 날" value={`${stats.recordedDays}일`} sub={`/ ${stats.daysInMonth}일`} color={P.ink} />
            <SummaryCard label="최장 스트릭" value={`🔥${stats.longestHabitStreak}`} sub={stats.longestHabitStreak > 0 ? "일 연속" : undefined} color={ORANGE} />
          </div>

          <SectionCard title="할 일 완료 추이" desc="날짜별 완료/미완료 개수">
            <TaskTrendChart stats={stats} />
          </SectionCard>

          <SectionCard title="습관 달성률" desc="습관별 이 달 달성률과 현재 스트릭">
            <HabitRateList stats={stats} onOpenHabits={onOpenHabits} />
          </SectionCard>

          <SectionCard title="시간대별 활용도" desc="시간표에 등록된 일정이 몰린 시간대">
            <TimeOfDayChart stats={stats} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
