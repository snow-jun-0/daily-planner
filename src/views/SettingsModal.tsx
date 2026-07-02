import { useRef, useState } from "react";
import {
  P, SyncConfig, downloadJSON, importJSON,
  getSyncConfig, setSyncConfig, pushToCloud, pullFromCloud,
} from "../lib";

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const saved = getSyncConfig();
  const [url, setUrl] = useState(saved?.url ?? "");
  const [key, setKey] = useState(saved?.key ?? "");
  const [code, setCode] = useState(saved?.code ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg = (): SyncConfig | null => {
    const c = { url: url.trim().replace(/\/$/, ""), key: key.trim(), code: code.trim() };
    if (!c.url || !c.key || !c.code) {
      setMsg("URL, 키, 동기화 코드를 모두 입력해줘.");
      return null;
    }
    setSyncConfig(c);
    return c;
  };

  const run = async (fn: (c: SyncConfig) => Promise<string>) => {
    const c = cfg();
    if (!c) return;
    setBusy(true);
    setMsg("");
    try {
      setMsg(await fn(c));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "오류가 났어.");
    } finally {
      setBusy(false);
    }
  };

  const onImportFile = async (f: File) => {
    try {
      const n = importJSON(await f.text());
      setMsg(`${n}일치 데이터를 가져왔어. 새로고침하면 반영돼.`);
    } catch {
      setMsg("파일을 읽지 못했어. 백업 JSON이 맞는지 확인해줘.");
    }
  };

  const inputStyle = { background: P.paper, border: `1px solid ${P.line}` };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "#22302A88" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: P.card }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="백업 및 동기화 설정"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Gowun Batang', serif" }}>
            백업 · 동기화
          </h2>
          <button onClick={onClose} className="text-lg px-2" style={{ color: P.faint }} aria-label="닫기">✕</button>
        </div>

        {/* JSON 백업 */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold mb-1">파일 백업</h3>
          <p className="text-xs mb-3" style={{ color: P.faint }}>
            전체 데이터를 JSON 파일로 저장하거나, 다른 기기에서 받은 파일을 불러와.
          </p>
          <div className="flex gap-2">
            <button onClick={downloadJSON}
              className="flex-1 py-2 rounded-lg text-sm font-medium text-white" style={{ background: P.green }}>
              백업 파일 저장
            </button>
            <button onClick={() => fileRef.current?.click()}
              className="flex-1 py-2 rounded-lg text-sm font-medium"
              style={{ color: P.green, border: `1px solid ${P.green}` }}>
              백업 파일 불러오기
            </button>
            <input
              ref={fileRef} type="file" accept=".json,application/json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }}
            />
          </div>
        </section>

        <div className="border-t mb-6" style={{ borderColor: P.line }} />

        {/* 클라우드 동기화 */}
        <section>
          <h3 className="text-sm font-semibold mb-1">클라우드 동기화 (Supabase)</h3>
          <p className="text-xs mb-3" style={{ color: P.faint }}>
            PC와 폰이 같은 동기화 코드를 쓰면 데이터를 주고받을 수 있어. 세팅 방법은 README 참고.
          </p>
          <div className="flex flex-col gap-2 mb-3">
            <input value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="Supabase URL (https://xxxx.supabase.co)"
              className="px-3 py-2 rounded-lg text-sm" style={inputStyle} />
            <input value={key} onChange={(e) => setKey(e.target.value)}
              placeholder="anon public 키"
              className="px-3 py-2 rounded-lg text-sm" style={inputStyle} />
            <input value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="동기화 코드 (나만 아는 문자열, 예: jun-planner-7301)"
              className="px-3 py-2 rounded-lg text-sm" style={inputStyle} />
          </div>
          <div className="flex gap-2">
            <button disabled={busy}
              onClick={() => run(async (c) => { await pushToCloud(c); return "이 기기 → 클라우드 업로드 완료."; })}
              className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: P.green }}>
              업로드
            </button>
            <button disabled={busy}
              onClick={() => run(async (c) =>
                (await pullFromCloud(c))
                  ? "클라우드 → 이 기기 다운로드 완료. 새로고침하면 반영돼."
                  : "클라우드에 아직 데이터가 없어. 다른 기기에서 먼저 업로드해줘.")}
              className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ color: P.green, border: `1px solid ${P.green}` }}>
              다운로드
            </button>
          </div>
          <p className="text-[11px] mt-2" style={{ color: P.faint }}>
            업로드/다운로드는 통째로 덮어쓰니까 방향을 확인하고 눌러줘.
          </p>
        </section>

        {msg && (
          <p className="mt-4 text-xs px-3 py-2 rounded-lg" style={{ background: P.paper, color: P.ink }}>
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
