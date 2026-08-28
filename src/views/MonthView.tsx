import { useEffect, useMemo, useState } from "react";
import { DAY_NAMES, MONTH_NAMES, P, daysWithData, dateKey, loadDay, allHabitsDoneForDate, minutesToLabel } from "../lib";
import { GEvent, hasGoogleConfig, listEventsForMonth, eventCoversDate, isAllDayEvent } from "../gcal";

interface Props {
  year: number;
  month: number;
  habitsVersion: number; // 습관 목록 변경 시 리렌더 트리거
  gSignedIn: boolean;
  onGSignedInChange: (v: boolean) => void;
  onSelectDay: (d: number) => void;
  onChangeMonth: (y: number, m: number) => void;
  onBackToYear: () => void;
  onOpenYearPicker: () => void;
  onOpenStats: () => void;
}

export default function MonthView({
  year, month, habitsVersion, gSignedIn, onGSignedInChange, onSelectDay, onChangeMonth, onBackToYear, onOpenYearPicker, onOpenStats,
}: Props) {
  const today = new Date();
  const marked = useMemo(() => daysWithData(year, month), [year, month]);
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();

  const [gEvents, setGEvents] = useState<GEvent[]>([]);
  // 날짜 클릭 1단계: 선택(미리보기), 2단계: 같은 날 재클릭 시 일간뷰 이동
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // 달이 바뀌면 선택 해제
  useEffect(() => {
    setSelectedDay(null);
  }, [year, month]);

  const handleDayClick = (d: number) => {
    if (selectedDay === d) onSelectDay(d);
    else setSelectedDay(d);
  };

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

  // 그 달에서 지정 습관을 전부 완료한 날짜(day 숫자) 집합
  const habitDoneDays = useMemo(() => {
    const set = new Set<number>();
    for (let d = 1; d <= days; d++) {
      const dow = (first + d - 1) % 7;
      if (allHabitsDoneForDate(dateKey(year, month, d), dow)) set.add(d);
    }
    return set;
  }, [year, month, days, first, habitsVersion]);

  const prev = () => (month === 0 ? onChangeMonth(year - 1, 11) : onChangeMonth(year, month - 1));
  const next = () => (month === 11 ? onChangeMonth(year + 1, 0) : onChangeMonth(year, month + 1));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="flex items-center justify-center text-xl leading-none w-7 h-7 shrink-0" style={{ color: P.faint }} aria-label="이전 달">‹</button>
          <h1 className="flex items-center gap-1.5 font-bold leading-none" style={{ fontFamily: "'Gowun Batang', serif", fontSize: 22 }}>
            <button onClick={onOpenYearPicker} className="flex items-center gap-0.5 leading-none" style={{ color: P.ink }} aria-label="연도 선택">
              {year}년
              <span className="leading-none" style={{ fontSize: 14, color: P.faint, fontFamily: "sans-serif" }}>▾</span>
            </button>
            <button onClick={onBackToYear} className="flex items-center gap-0.5 leading-none" style={{ color: P.green }} aria-label="월 선택">
              {MONTH_NAMES[month]}
              <span className="leading-none" style={{ fontSize: 14, color: P.faint, fontFamily: "sans-serif" }}>▾</span>
            </button>
          </h1>
          <button onClick={next} className="flex items-center justify-center text-xl leading-none w-7 h-7 shrink-0" style={{ color: P.faint }} aria-label="다음 달">›</button>
        </div>
        <button onClick={onOpenStats} className="flex items-center justify-center w-7 h-7 rounded-md shrink-0" style={{ color: P.faint, border: `1px solid ${P.line}`, fontSize: 13 }}
          aria-label="통계" title="완료율·습관·시간표 통계 보기">
          📊
        </button>
      </div>

      <div className="card">
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {DAY_NAMES.map((d, i) => (
            <p key={d} className="text-center text-xs font-medium py-1"
              style={{ color: i === 0 ? P.red : i === 6 ? P.blue : P.faint }}>
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
            const isSelected = selectedDay === d;
            const has = marked.has(d);
            const data = has ? loadDay(dateKey(year, month, d)) : null;
            const remaining = data ? data.tasks.filter((t) => !t.done).length : 0;
            const dayGEvents = (gEventsByDay.get(d) ?? [])
              .slice()
              .sort((a, b) => Number(isAllDayEvent(b)) - Number(isAllDayEvent(a)));

            // 일정 표시: 제목 텍스트 없이 색점만 (블록 → 남은 할 일 → 구글 일정 순, 최대 3개)
            const dotColors: string[] = [];
            if (data) {
              for (const b of data.blocks) dotColors.push(b.color || P.sage);
              if (remaining > 0) dotColors.push(P.highlight);
            }
            for (let k = 0; k < dayGEvents.length; k++) dotColors.push("#4285F4");
            const dots = dotColors.slice(0, 3);

            return (
              <button
                key={d}
                onClick={() => handleDayClick(d)}
                aria-pressed={isSelected}
                className="relative rounded-lg p-1 min-h-[2.6rem] sm:min-h-[3rem] flex flex-col items-center transition-transform hover:-translate-y-0.5"
                style={{
                  background: isSelected ? `color-mix(in srgb, ${P.green} 12%, ${P.card})` : P.card,
                  border: `1px solid ${isSelected || isToday ? P.green : P.line}`,
                  boxShadow: isSelected
                    ? `0 0 0 2px color-mix(in srgb, ${P.green} 45%, transparent)`
                    : isToday
                    ? `0 0 0 2px color-mix(in srgb, ${P.green} 20%, transparent)`
                    : "none",
                }}
              >
                {habitDoneDays.has(d) && (
                  <span
                    className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                    style={{ background: P.green }}
                    title="습관 모두 완료"
                    aria-hidden="true"
                  />
                )}
                <span
                  className="text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full"
                  style={{
                    background: isToday ? P.green : "transparent",
                    color: isToday ? "#fff" : dow === 0 ? P.red : dow === 6 ? P.blue : P.ink,
                  }}
                >
                  {d}
                </span>
                {dots.length > 0 && (
                  <div className="mt-0.5 flex items-center justify-center gap-0.5">
                    {dots.map((c, di) => (
                      <span key={di} className="w-1 h-1 rounded-full shrink-0" style={{ background: c }} aria-hidden="true" />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay != null && (() => {
        const sData = loadDay(dateKey(year, month, selectedDay));
        const sBlocks = [...sData.blocks].sort((a, b) => a.start - b.start);
        const sTasks = sData.tasks.filter((t) => !t.done);
        const sGEvents = (gEventsByDay.get(selectedDay) ?? [])
          .slice()
          .sort((a, b) => Number(isAllDayEvent(b)) - Number(isAllDayEvent(a)));
        const isEmpty = sBlocks.length === 0 && sTasks.length === 0 && sGEvents.length === 0;
        return (
          <button
            onClick={() => onSelectDay(selectedDay)}
            className="card w-full text-left mt-3 transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>
                {month + 1}월 {selectedDay}일
              </h2>
              <span className="text-xs shrink-0" style={{ color: P.green }}>일간뷰 열기 ›</span>
            </div>
            {isEmpty ? (
              <p className="text-sm py-1" style={{ color: P.faint }}>이 날은 아직 일정이 없어.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {sBlocks.map((b) => (
                  <li key={`b-${b.id}`} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: b.color || P.sage }} aria-hidden="true" />
                    <span className="shrink-0 text-xs" style={{ color: P.faint }}>{minutesToLabel(b.start)}</span>
                    <span className="truncate" style={{ color: P.ink }}>{b.title}</span>
                  </li>
                ))}
                {sGEvents.map((ev, i) => (
                  <li key={`g-${i}`} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#4285F4" }} aria-hidden="true" />
                    <span className="shrink-0 text-xs" style={{ color: P.faint }}>{isAllDayEvent(ev) ? "종일" : "구글"}</span>
                    <span className="truncate" style={{ color: P.ink }}>{ev.summary || "(제목 없음)"}</span>
                  </li>
                ))}
                {sTasks.map((t) => (
                  <li key={`t-${t.id}`} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: P.highlight }} aria-hidden="true" />
                    <span className="truncate" style={{ color: P.ink }}>{t.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </button>
        );
      })()}
    </div>
  );
}
