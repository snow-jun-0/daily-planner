import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList,
  PieChart, Pie,
} from "recharts";
import { MONTH_NAMES, DAY_NAMES, P, CHART_COLORS, getMonthStats, MonthStats } from "../lib";

interface Props {
  onBack: () => void;
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="paper-card rounded-2xl p-4" style={{ background: P.card, border: `1px solid ${P.line}` }}>
      <p className="text-xs mb-1" style={{ color: P.faint }}>{label}</p>
      <p className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "'Gowun Batang', serif", color: P.green }}>
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

function MoodHeatmap({ stats, year, month }: { stats: MonthStats; year: number; month: number }) {
  const first = new Date(year, month, 1).getDay();
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d, i) => (
          <p key={d} className="text-center text-[10px] font-medium" style={{ color: i === 0 ? P.red : i === 6 ? "#2C5AA0" : P.faint }}>
            {d}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
        {stats.moodByDay.map(({ day, mood }) => (
          <div
            key={day}
            title={mood ? `${day}일 ${mood}` : `${day}일`}
            className="aspect-square rounded-lg flex items-center justify-center text-sm"
            style={{
              background: mood ? `${P.highlight}55` : P.paper,
              border: `1px solid ${mood ? P.highlight : P.line}`,
            }}
          >
            {mood ? <span>{mood}</span> : <span className="text-[9px]" style={{ color: P.faint }}>{day}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MoodDonut({ stats }: { stats: MonthStats }) {
  if (stats.moodCounts.length === 0) return <EmptyRow text="기분을 기록한 날이 아직 없어요" />;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <ResponsiveContainer width="100%" height={160} className="max-w-[160px] shrink-0">
        <PieChart>
          <Pie
            data={stats.moodCounts}
            dataKey="count"
            nameKey="mood"
            innerRadius={40}
            outerRadius={70}
            paddingAngle={2}
            stroke="none"
          >
            {stats.moodCounts.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { mood: string; count: number };
            return <TooltipBox>{p.mood} {p.count}일</TooltipBox>;
          }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
        {stats.moodCounts.map((m, i) => (
          <span
            key={m.mood}
            className="text-xs px-2 py-1 rounded-full flex items-center gap-1"
            style={{ background: `${CHART_COLORS[i % CHART_COLORS.length]}22`, color: P.ink }}
          >
            <span>{m.mood}</span>
            <span style={{ color: P.faint }}>{m.count}일</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function HabitBars({ stats }: { stats: MonthStats }) {
  if (stats.habitStats.length === 0) return <EmptyRow text="이 달에 등록된 습관이 없어요" />;
  const data = stats.habitStats.map((h) => ({
    label: `${h.habit.emoji ?? ""} ${h.habit.name}`.trim(),
    rate: h.rate,
    streak: h.streak,
    color: h.habit.color ?? P.green,
  }));
  const height = Math.max(80, data.length * 40 + 16);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={P.line} horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: P.faint }} tickLine={false} axisLine={{ stroke: P.line }} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: P.ink }} tickLine={false} axisLine={false} width={110} />
        <Tooltip
          cursor={{ fill: `${P.sage}22` }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof data)[number];
            return <TooltipBox>{p.label} · 달성률 {p.rate}%{p.streak > 0 ? ` · 🔥${p.streak}` : ""}</TooltipBox>;
          }}
        />
        <Bar dataKey="rate" radius={[0, 6, 6, 0]} barSize={16}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          <LabelList
            dataKey="rate"
            position="right"
            formatter={(v: unknown) => `${v ?? 0}%`}
            style={{ fontSize: 11, fill: P.ink, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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

export default function StatsView({ onBack }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const stats = useMemo(() => getMonthStats(year, month), [year, month]);

  const prev = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1);
  };
  const next = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1);
  };

  const isEmpty = stats.recordedDays === 0 && stats.habitStats.every((h) => h.rate === 0 && h.streak === 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: P.faint, border: `1px solid ${P.line}` }}>
          ‹ 달력으로
        </button>
        <div className="flex items-center gap-5">
          <button onClick={prev} className="text-2xl px-2" style={{ color: P.faint }} aria-label="이전 달">‹</button>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>
            {year}년 <span style={{ color: P.green }}>{MONTH_NAMES[month]}</span> 통계
          </h1>
          <button onClick={next} className="text-2xl px-2" style={{ color: P.faint }} aria-label="다음 달">›</button>
        </div>
        <span className="w-20" />
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
            <SummaryCard label="할 일 완료율" value={`${stats.overallTaskRate}%`} sub={`${stats.totalDone}/${stats.totalTasks}건`} />
            <SummaryCard label="습관 평균 달성률" value={`${stats.avgHabitRate}%`} sub={stats.habitStats.length ? `습관 ${stats.habitStats.length}개` : undefined} />
            <SummaryCard label="기록한 날" value={`${stats.recordedDays}일`} sub={`/ ${stats.daysInMonth}일`} />
            <SummaryCard label="최장 스트릭" value={`🔥${stats.longestHabitStreak}`} sub={stats.longestHabitStreak > 0 ? "일 연속" : undefined} />
          </div>

          <SectionCard title="할 일 완료 추이" desc="날짜별 완료/미완료 개수">
            <TaskTrendChart stats={stats} />
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="무드 캘린더" desc="날짜별 기록된 기분">
              <MoodHeatmap stats={stats} year={year} month={month} />
            </SectionCard>
            <SectionCard title="무드 분포" desc="이 달 기분별 기록 일수">
              <MoodDonut stats={stats} />
            </SectionCard>
          </div>

          <SectionCard title="습관 달성률" desc="습관별 이 달 달성률과 현재 스트릭">
            <HabitBars stats={stats} />
          </SectionCard>

          <SectionCard title="시간대별 활용도" desc="시간표에 등록된 일정이 몰린 시간대">
            <TimeOfDayChart stats={stats} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
