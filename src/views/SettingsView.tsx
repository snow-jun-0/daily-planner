import { useState } from "react";
import {
  P, NotifyMode,
  getNotifyMode, setNotifyMode as persistNotifyMode,
  getNotifyDaily, setNotifyDaily as persistNotifyDaily,
  getDarkMode, setDarkMode as persistDarkMode,
  resetAllData, TIMELINE_START_MIN, TIMELINE_END_MIN, minutesToLabel,
} from "../lib";
import { hasGoogleConfig } from "../gcal";
import { requestNotificationPermission } from "../pomodoro";

interface Props {
  gSignedIn: boolean;
  gBusy: boolean;
  gTokenExpired: boolean;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onOpenBackup: () => void;
}

// ---------- 아이콘 (BottomTabBar와 동일한 스타일 규칙) ----------
const ICON_PROPS = {
  width: 17, height: 17, viewBox: "0 0 24 24", fill: "none",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

function GoogleIcon() {
  return (
    <svg {...ICON_PROPS} stroke={P.green}>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}
function CloudIcon() {
  return (
    <svg {...ICON_PROPS} stroke={P.green}>
      <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.7A4 4 0 0 0 6.5 19h11z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg {...ICON_PROPS} stroke={P.red}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
function ClockRangeIcon() {
  return (
    <svg {...ICON_PROPS} stroke={P.green}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg {...ICON_PROPS} stroke={P.green}>
      <path d="M20 14.5a8 8 0 1 1-9.5-9.9 6.5 6.5 0 0 0 9.5 9.9z" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg {...ICON_PROPS} stroke={P.green}>
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={P.faint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// ---------- 공용 조각 ----------
function GroupLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-semibold px-1 mb-1.5" style={{ color: P.faint, letterSpacing: "0.3px" }}>
      {children}
    </p>
  );
}

function IconChip({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <span
      className="shrink-0 flex items-center justify-center"
      style={{ width: 30, height: 30, borderRadius: 9, background: danger ? "#FBEAE7" : P.paper }}
    >
      {children}
    </span>
  );
}

function RowText({ title, subtitle, danger }: { title: string; subtitle?: string; danger?: boolean }) {
  return (
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-semibold truncate" style={{ color: danger ? P.red : P.ink }}>{title}</span>
      {subtitle && <span className="block text-xs mt-0.5 truncate" style={{ color: P.faint }}>{subtitle}</span>}
    </span>
  );
}

/** 클릭하면 다른 곳(모달 등)으로 이동하는 행 — 오른쪽에 화살표만 있고 내부에 별도 컨트롤은 없음 */
function NavRow({ icon, title, subtitle, value, danger, last, onClick, disabled }: {
  icon: React.ReactNode; title: string; subtitle?: string; value?: string; danger?: boolean;
  last?: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 py-3 text-left disabled:opacity-50"
      style={{ borderBottom: last ? "none" : `1px solid ${P.line}` }}
    >
      <IconChip danger={danger}>{icon}</IconChip>
      <RowText title={title} subtitle={subtitle} danger={danger} />
      {value && <span className="shrink-0 text-xs" style={{ color: P.faint }}>{value}</span>}
      <ChevronIcon />
    </button>
  );
}

/** 오른쪽에 뱃지/토글 등 자체 컨트롤이 있는 행 — 행 전체는 클릭되지 않음 */
function InfoRow({ icon, title, subtitle, right, last }: {
  icon: React.ReactNode; title: string; subtitle?: string; right: React.ReactNode; last?: boolean;
}) {
  return (
    <div
      className="w-full flex items-center gap-3 py-3"
      style={{ borderBottom: last ? "none" : `1px solid ${P.line}` }}
    >
      <IconChip>{icon}</IconChip>
      <RowText title={title} subtitle={subtitle} />
      <span className="shrink-0">{right}</span>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative shrink-0"
      style={{ width: 40, height: 24, borderRadius: 999, background: checked ? P.green : P.line, transition: "background-color .15s" }}
    >
      <span
        className="absolute rounded-full"
        style={{
          width: 18, height: 18, top: 3, left: 3, background: "#fff",
          transform: checked ? "translateX(16px)" : "translateX(0)",
          transition: "transform .15s", boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );
}

function Badge({ tone, children }: { tone: "on" | "off" | "warn"; children: string }) {
  const styles = {
    on: { background: "#E8F1EB", color: P.green },
    off: { background: P.paper, color: P.faint },
    warn: { background: "#FBEAE7", color: P.red },
  }[tone];
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={styles}>{children}</span>
  );
}

const NOTIFY_MODE_OPTIONS: { id: NotifyMode; label: string }[] = [
  { id: "mute", label: "무음" },
  { id: "vibrate", label: "진동" },
  { id: "sound", label: "소리" },
];

export default function SettingsView({
  gSignedIn, gBusy, gTokenExpired, onConnectGoogle, onDisconnectGoogle, onOpenBackup,
}: Props) {
  const [notifyMode, setNotifyModeState] = useState<NotifyMode>(() => getNotifyMode());
  const [notifyDaily, setNotifyDailyState] = useState<boolean>(() => getNotifyDaily());
  const [darkMode, setDarkModeState] = useState<boolean>(() => getDarkMode());
  const notificationSupported = typeof Notification !== "undefined";
  const [permissionDenied, setPermissionDenied] = useState(
    () => notificationSupported && Notification.permission === "denied"
  );

  const changeNotifyMode = async (mode: NotifyMode) => {
    setNotifyModeState(mode);
    persistNotifyMode(mode);
    if (mode !== "mute" && notificationSupported) {
      await requestNotificationPermission();
      setPermissionDenied(Notification.permission === "denied");
    }
  };

  const changeNotifyDaily = async (v: boolean) => {
    setNotifyDailyState(v);
    persistNotifyDaily(v);
    if (v && notificationSupported) {
      await requestNotificationPermission();
      setPermissionDenied(Notification.permission === "denied");
    }
  };

  const changeDarkMode = (v: boolean) => {
    setDarkModeState(v);
    persistDarkMode(v);
  };

  const handleResetData = () => {
    if (!window.confirm("정말 모든 로컬 데이터를 초기화할까? 할 일·시간표·습관·D-Day 등 모든 기록이 사라지고 되돌릴 수 없어.")) return;
    resetAllData();
    window.location.reload();
  };

  const timeRangeLabel = `${minutesToLabel(TIMELINE_START_MIN)} - ${minutesToLabel(TIMELINE_END_MIN)}`;

  return (
    <div className="flex flex-col gap-5">
      <p style={{ fontFamily: "'Gowun Batang', serif", fontSize: 20, color: P.ink, fontWeight: 700 }}>설정</p>

      {/* 계정 연동 */}
      {hasGoogleConfig() && (
        <section>
          <GroupLabel>계정 연동</GroupLabel>
          <div className="card">
            <InfoRow
              last
              icon={<GoogleIcon />}
              title="구글 캘린더"
              subtitle={gSignedIn ? undefined : gTokenExpired ? "연결이 만료됐어. 다시 연결해줘" : "일정을 구글 캘린더와 동기화해"}
              right={
                <div className="flex items-center gap-2">
                  <Badge tone={gSignedIn ? "on" : gTokenExpired ? "warn" : "off"}>
                    {gSignedIn ? "연결됨" : gTokenExpired ? "만료됨" : "연결 안됨"}
                  </Badge>
                  {gSignedIn ? (
                    <button onClick={onDisconnectGoogle} disabled={gBusy}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                      style={{ color: P.faint, border: `1px solid ${P.line}` }}>
                      해제
                    </button>
                  ) : (
                    <button onClick={onConnectGoogle} disabled={gBusy}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                      style={{ color: P.green, border: `1px solid ${P.green}` }}>
                      {gTokenExpired ? "다시 연결하기" : "연결"}
                    </button>
                  )}
                </div>
              }
            />
          </div>
        </section>
      )}

      {/* 데이터 */}
      <section>
        <GroupLabel>데이터</GroupLabel>
        <div className="card">
          <NavRow
            icon={<CloudIcon />}
            title="백업 · 동기화"
            subtitle="파일 백업 또는 다른 기기와 데이터 동기화"
            onClick={onOpenBackup}
          />
          <NavRow
            last
            danger
            icon={<TrashIcon />}
            title="데이터 초기화"
            subtitle="이 기기에 저장된 모든 기록 삭제"
            onClick={handleResetData}
          />
        </div>
      </section>

      {/* 표시 */}
      <section>
        <GroupLabel>표시</GroupLabel>
        <div className="card">
          <InfoRow
            icon={<ClockRangeIcon />}
            title="시간표 범위"
            subtitle="하루 시간표에 표시되는 시간대"
            right={<span className="text-xs font-medium" style={{ color: P.faint }}>{timeRangeLabel}</span>}
          />
          <InfoRow
            last
            icon={<MoonIcon />}
            title="다크 모드"
            subtitle="화면 배색을 어둡게 (곧 적용 예정)"
            right={<Toggle checked={darkMode} onChange={changeDarkMode} label="다크 모드" />}
          />
        </div>
      </section>

      {/* 알림 */}
      <section>
        <GroupLabel>알림</GroupLabel>
        <div className="card flex flex-col gap-1">
          <div className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${P.line}` }}>
            <IconChip><BellIcon /></IconChip>
            <RowText title="알림 방식" subtitle="뽀모도로 세션이 끝나면 이 방식으로 알려줘" />
          </div>
          <div className="flex gap-1 -mt-2 mb-1">
            {NOTIFY_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => changeNotifyMode(opt.id)}
                className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: notifyMode === opt.id ? P.green : "transparent",
                  color: notifyMode === opt.id ? "#fff" : P.faint,
                  border: `1px solid ${notifyMode === opt.id ? P.green : P.line}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {!notificationSupported && (
            <p className="text-[11px] pb-1" style={{ color: P.faint }}>
              이 브라우저는 알림을 지원하지 않아. 진동/소리는 그래도 동작할 수 있어.
            </p>
          )}
          {notificationSupported && permissionDenied && notifyMode !== "mute" && (
            <p className="text-[11px] pb-1" style={{ color: P.red }}>
              브라우저 알림이 차단되어 있어. 브라우저 설정에서 이 사이트의 알림을 허용해줘.
            </p>
          )}

          <InfoRow
            last
            icon={<MoonIcon />}
            title="저녁 회고 알림"
            subtitle="매일 저녁 9시, 오늘 하루를 기록해보라고 알려줘"
            right={<Toggle checked={notifyDaily} onChange={changeNotifyDaily} label="저녁 회고 알림" />}
          />
        </div>
      </section>
    </div>
  );
}
