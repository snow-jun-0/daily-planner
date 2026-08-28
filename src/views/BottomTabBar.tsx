const ACTIVE_COLOR = "var(--green)";
const INACTIVE_COLOR = "#9AA5A0"; // 라이트·다크 모두에서 무난한 중간 회색
const ACTIVE_PILL_BG = "var(--tint-green)";

const ICON_PROPS = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CalendarIcon({ color }: { color: string }) {
  return (
    <svg {...ICON_PROPS} stroke={color}>
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

function BookmarkIcon({ color }: { color: string }) {
  return (
    <svg {...ICON_PROPS} stroke={color}>
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

function ClockIcon({ color }: { color: string }) {
  return (
    <svg {...ICON_PROPS} stroke={color}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function TimerIcon({ color }: { color: string }) {
  return (
    <svg {...ICON_PROPS} stroke={color}>
      <line x1="10" x2="14" y1="2" y2="2" />
      <line x1="12" x2="15" y1="14" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  );
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <svg {...ICON_PROPS} stroke={color}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export type TabKey = "month" | "memo" | "today" | "timer" | "settings";
export type TabAction = "month" | "memo" | "day" | "timer" | "settings";

const TABS: { key: TabKey; label: string; Icon: (p: { color: string }) => JSX.Element; action: TabAction }[] = [
  { key: "month", label: "월간", Icon: CalendarIcon, action: "month" },
  { key: "memo", label: "메모", Icon: BookmarkIcon, action: "memo" },
  { key: "today", label: "오늘", Icon: ClockIcon, action: "day" },
  { key: "timer", label: "타이머", Icon: TimerIcon, action: "timer" },
  { key: "settings", label: "설정", Icon: SettingsIcon, action: "settings" },
];

interface Props {
  activeTab: TabKey | null; // null = 어느 탭도 활성 아님 (예: 통계 화면)
  onSelect: (action: TabAction) => void;
}

export default function BottomTabBar({ activeTab, onSelect }: Props) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50"
      style={{
        background: "var(--card)",
        boxShadow: "0 -3px 16px rgba(33,48,41,0.08)",
        borderTop: "1px solid var(--line)",
        paddingTop: 10,
        paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
      }}
    >
      <div className="max-w-5xl mx-auto flex items-start justify-between px-2">
        {TABS.map(({ key, label, Icon, action }) => {
          const isCenter = key === "today";
          const active = key === activeTab;
          const color = active ? ACTIVE_COLOR : INACTIVE_COLOR;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(action)}
              className="flex-1 flex flex-col items-center gap-1"
              style={{ color }}
            >
              <span
                className="flex items-center justify-center"
                style={
                  isCenter && active
                    ? { background: ACTIVE_PILL_BG, borderRadius: 18, padding: "7px 18px" }
                    : { padding: "7px 0" }
                }
              >
                <Icon color={color} />
              </span>
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 500 }}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
