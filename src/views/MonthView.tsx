import { useEffect, useMemo, useState } from "react";
import { DAY_NAMES, MONTH_NAMES, P, daysWithData, dateKey, loadDay } from "../lib";
import { GEvent, hasGoogleConfig, listEventsForMonth, eventCoversDate, isAllDayEvent } from "../gcal";

interface Props {
  year: number;
  month: number;
  gSignedIn: boolean;
  onGSignedInChange: (v: boolean) => void;
  onSelectDay: (d: number) => void;
  onChangeMonth: (y: number, m: number) => void;
  onBackToYear: () => void;
}

export default function MonthView({
  year, month, gSignedIn, onGSignedInChange, onSelectDay, onChangeMonth, onBackToYear,
}: Props) {
  const today = new Date();
  const marked = useMemo(() => daysWithData(year, month), [year, month]);
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();

  const [gEvents, setGEvents] = useState<GEvent[]>([]);

  // 달이 바뀌거나 구글 로그인 상태가 바뀌면 그 달의 구글 일정을 한 번에 불러옴
  useEffect(() => {
    if (!hasGoogleConfig() || !gSignedIn) {
      setGEvents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const events = await listEventsForMonth(year, month);
        if (!cancelled) setGEvents(events);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof Error && e.message === "NOT_SIGNED_IN") {
          onGSignedInChange(false);
        }
        setGEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month, gSignedIn]);

  // 날짜별로 구글 일정 분배 (종일 + 시간 모두 포함, 하루에 걸쳐있는 이벤트는 그 날짜에 모두 표시)
  const gEventsByDay = useMemo(() => {
    const map = new Map<number, GEvent[]>();
    if (gEvents.length === 0) return map;
    for (let d = 1; d <= days; d++) {
      const ds = dateKey(year, month, d);
      const dayEvents = gEvents.filter((ev) => eventCoversDate(ev, ds));
      if (dayEvents.length > 0) map.set(d, dayEvents);
    }
    return map;
  }, [gEvents, year, month, days]);

  const prev = () => (month === 0 ? onChangeMonth(year - 1, 11) : onChangeMonth(year, month - 1));
  const next = () => (month === 11 ? onChangeMonth(year + 1, 0) : onChangeMonth(year, month + 1));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBackToYear} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: P.faint, border: `1px solid ${P.line}` }}>
          ‹ {year}년
        </button>
        <div className="flex items-center gap-5">
          <button onClick={prev} className="text-2xl px-2" style={{ color: P.faint }} aria-label="이전 달">‹</button>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>
            {year}년 <span style={{ color: P.green }}>{MONTH_NAMES[month]}</span>
          </h1>
          <button onClick={next} className="text-2xl px-2" style={{ color: P.faint }} aria-label="다음 달">›</button>
        </div>
        <span className="w-16" />
      </div>

      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {DAY_NAMES.map((d, i) => (
          <p key={d} className="text-center text-xs font-medium py-1"
            style={{ color: i === 0 ? P.red : i === 6 ? "#2C5AA0" : P.faint }}>
            {d}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: first }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const d = i + 1;
          const dow = (first + i) % 7;
          const isToday =
            today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
          const has = marked.has(d);
          const data = has ? loadDay(dateKey(year, month, d)) : null;
          const remaining = data ? data.tasks.filter((t) => !t.done).length : 0;
          const dayGEvents = (gEventsByDay.get(d) ?? [])
            .slice()
            .sort((a, b) => Number(isAllDayEvent(b)) - Number(isAllDayEvent(a)));

          return (
            <button
              key={d}
              onClick={() => onSelectDay(d)}
              className="rounded-xl p-2 min-h-[4.5rem] sm:min-h-[5.5rem] text-left flex flex-col transition-transform hover:-translate-y-0.5"
              style={{
                background: P.card,
                border: `1px solid ${isToday ? P.green : P.line}`,
                boxShadow: isToday ? `0 0 0 2px ${P.green}33` : "none",
              }}
            >
              <span className="flex items-center justify-between w-full">
                <span
                  className="text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full"
                  style={{
                    background: isToday ? P.green : "transparent",
                    color: isToday ? "#fff" : dow === 0 ? P.red : dow === 6 ? "#2C5AA0" : P.ink,
                  }}
                >
                  {d}
                </span>
                {data?.mood && <span className="text-xs leading-none">{data.mood}</span>}
              </span>
              {data && (
                <div className="mt-1 flex flex-col gap-0.5 overflow-hidden">
                  {data.blocks.slice(0, 2).map((b) => (
                    <span key={b.id} className="text-[9px] truncate px-1 rounded"
                      style={{ background: `${P.sage}44`, color: P.ink }}>
                      {b.title}
                    </span>
                  ))}
                  {remaining > 0 && (
                    <span className="text-[9px] px-1 rounded" style={{ background: `${P.highlight}66` }}>
                      할 일 {remaining}
                    </span>
                  )}
                </div>
              )}
              {dayGEvents.length > 0 && (
                <div className="mt-1 flex flex-col gap-0.5 overflow-hidden">
                  {dayGEvents.slice(0, 2).map((ev) => (
                    <span key={ev.id} className="text-[9px] truncate px-1 rounded flex items-center gap-0.5"
                      style={{ background: "#4285F42E", color: "#4285F4" }}>
                      <span className="shrink-0" style={{ fontSize: 6 }}>●</span>
                      {ev.summary || "(제목 없음)"}
                    </span>
                  ))}
                  {dayGEvents.length > 2 && (
                    <span className="text-[9px] px-1" style={{ color: "#4285F4" }}>
                      +{dayGEvents.length - 2}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
