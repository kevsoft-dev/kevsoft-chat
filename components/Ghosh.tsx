"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type State = "none" | "pending" | "approved" | "rejected" | "revoked" | "lockdown" | "root";
type Room = { id: string; name: string; topic: string | null; locked: boolean; ttl: number | null; last_id: number };
type Msg = { id: number; body: string; at: string; mine: boolean; sys?: boolean; fresh?: boolean };

const hm = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":");
const ttlLabel = (s: number | null) => (!s ? "" : s < 3600 ? `${s / 60}m` : s < 86400 ? `${s / 3600}j` : `${s / 86400}h`);

async function api(url: string, body?: object) {
  try {
    const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: { error: "Koneksi terputus" } }; }
}

// Teks muncul huruf demi huruf (maks ~1,6 detik berapa pun panjangnya).
function Typed({ text, onTick }: { text: string; onTick?: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const step = Math.max(1, Math.ceil(text.length / 90));
    const t = setInterval(() => setN((v) => { const x = Math.min(text.length, v + step); if (x >= text.length) clearInterval(t); return x; }), 18);
    return () => clearInterval(t);
  }, [text]);
  useEffect(() => { onTick?.(); }, [n, onTick]);
  return <>{text.slice(0, n)}{n < text.length && <span className="gh-caret" />}</>;
}

function Boot({ lines, onDone }: { lines: string[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= lines.length) { const t = setTimeout(onDone, 350); return () => clearTimeout(t); }
    const t = setTimeout(() => setI(i + 1), 380 + Math.random() * 220);
    return () => clearTimeout(t);
  }, [i, lines.length, onDone]);
  return (
    <div className="gh-boot" onClick={onDone}>
      {lines.slice(0, i).map((l, k) => <div key={k}><span className="gh-dim">[ok]</span> {l}</div>)}
      {i < lines.length && <div><span className="gh-caret" /></div>}
    </div>
  );
}

function Frame({ children, status }: { children: React.ReactNode; status?: string }) {
  return (
    <div className="gh">
      <header className="gh-top">
        <span className="gh-logo">KEVSOFT-CHAT</span>
        <span className="gh-status">{status ?? "restricted"}</span>
      </header>
      {children}
    </div>
  );
}

function Gate({ state, onRequest, busy, err }: { state: State; onRequest: (note: string) => void; busy: boolean; err: string }) {
  const [note, setNote] = useState("");
  const msg: Record<string, [string, string]> = {
    none: ["ACCESS RESTRICTED", "Ruang ini hanya untuk email yang sudah disetujui. Kamu bisa mengajukan permintaan akses."],
    pending: ["REQUEST PENDING", "Permintaan terkirim. Tunggu persetujuan owner utama. Halaman ini tidak perlu dibuka terus."],
    rejected: ["ACCESS DENIED", "Permintaan ditolak."],
    revoked: ["ACCESS REVOKED", "Akses untuk akun ini sudah dicabut."],
    lockdown: ["LOCKDOWN", "Ruang sedang dikunci sementara. Coba lagi nanti."],
  };
  const [h, p] = msg[state] ?? msg.none;
  return (
    <Frame status={state === "pending" ? "pending" : "restricted"}>
      <main className="gh-gate">
        <div className="gh-card">
          <div className="gh-h">{h}</div>
          <p>{p}</p>
          {state === "none" && (
            <>
              <label className="gh-dim" htmlFor="gh-note">pesan untuk owner (opsional)</label>
              <input id="gh-note" className="gh-in" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="siapa kamu / kenapa perlu akses" autoComplete="off" />
              <button className="gh-btn" disabled={busy} onClick={() => onRequest(note)}>{busy ? "mengirim…" : "minta akses"}</button>
            </>
          )}
          {err && <div className="gh-err">{err}</div>}
          <a className="gh-link" href="/">← keluar</a>
        </div>
      </main>
    </Frame>
  );
}

export default function Ghosh({ initial, root }: { initial: State; root: boolean }) {
  const [state, setState] = useState<State>(initial);
  const [booted, setBooted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [locked, setLocked] = useState(false);
  const [online, setOnline] = useState(0);
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState(false);
  const [sending, setSending] = useState(false);
  const lastId = useRef(0);
  const curRef = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const sysId = useRef(0);
  const stick = useRef(true);

  const inside = state === "root" || state === "approved";
  const room = rooms.find((r) => r.id === cur) ?? null;

  const scroll = useCallback(() => { const el = logRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, []);
  const sys = useCallback((t: string) => setMsgs((m) => [...m, { id: --sysId.current, body: t, at: new Date().toISOString(), mine: false, sys: true, fresh: true }]), []);

  // Status berkala (menangkap persetujuan, pencabutan, lockdown).
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await api("/api/ghosh/status");
      if (!alive) return;
      if (r.status === 401) { window.location.assign("/sign-in?next=/ghosh"); return; }
      if (r.ok && r.data.state) setState(r.data.state);
    };
    tick();
    const t = setInterval(tick, inside ? 15000 : 6000);
    return () => { alive = false; clearInterval(t); };
  }, [inside]);

  const loadRooms = useCallback(async () => {
    const r = await api("/api/ghosh/rooms");
    if (r.ok) { setRooms(r.data.rooms); setCur((c) => c ?? r.data.rooms[0]?.id ?? null); }
  }, []);
  useEffect(() => { if (inside) { loadRooms(); const t = setInterval(loadRooms, 12000); return () => clearInterval(t); } }, [inside, loadRooms]);

  // Ganti room: muat ulang riwayat.
  useEffect(() => {
    curRef.current = cur; lastId.current = 0; setMsgs([]); stick.current = true;
  }, [cur]);

  // Polling pesan.
  useEffect(() => {
    if (!inside || !cur) return;
    let alive = true, first = true;
    const poll = async () => {
      if (!alive || curRef.current !== cur) return;
      const r = await api(`/api/ghosh/messages?room=${cur}&after=${lastId.current}`);
      if (!alive || curRef.current !== cur) return;
      if (r.ok) {
        setLocked(!!r.data.locked); setOnline(r.data.online ?? 0);
        const list: Msg[] = r.data.messages;
        if (list.length) {
          lastId.current = list[list.length - 1].id;
          const isFirst = first;
          setMsgs((m) => [...m, ...list.map((x) => ({ ...x, fresh: !isFirst && !x.mine }))]);
        }
        first = false;
      }
    };
    poll();
    const t = setInterval(poll, document.hidden ? 6000 : 2000);
    return () => { alive = false; clearInterval(t); };
  }, [inside, cur]);

  useEffect(() => { scroll(); }, [msgs, scroll]);

  // Layar disamarkan saat tab tidak aktif.
  useEffect(() => {
    const f = () => setHidden(document.hidden);
    const b = () => setHidden(true), a = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", f); window.addEventListener("blur", b); window.addEventListener("focus", a);
    return () => { document.removeEventListener("visibilitychange", f); window.removeEventListener("blur", b); window.removeEventListener("focus", a); };
  }, []);

  async function requestAccess(note: string) {
    setBusy(true); setErr("");
    const r = await api("/api/ghosh/request", { note });
    setBusy(false);
    if (r.ok) setState(r.data.state === "approved" ? "approved" : "pending");
    else { setErr(r.data.error || "Gagal"); if (r.data.state) setState(r.data.state); }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    if (body.startsWith("/")) { setText(""); command(body.slice(1).trim().toLowerCase()); return; }
    if (!cur) return;
    setSending(true);
    const r = await api("/api/ghosh/messages", { room: cur, body });
    setSending(false);
    if (r.ok) { setText(""); stick.current = true; } else sys(`error: ${r.data.error || "gagal mengirim"}`);
  }

  function command(c: string) {
    const [name, arg] = c.split(/\s+/);
    if (name === "help") sys("perintah: /help  /rooms  /room <nama>  /who  /clear  /exit");
    else if (name === "clear") setMsgs([]);
    else if (name === "who") sys(`${online} Unknown online`);
    else if (name === "rooms") sys(rooms.map((r) => `#${r.name}${r.locked ? " (locked)" : ""}`).join("  ") || "tidak ada room");
    else if (name === "room") {
      const r = rooms.find((x) => x.name === (arg ?? "").replace(/^#/, ""));
      if (r) setCur(r.id); else sys("room tidak ditemukan");
    } else if (name === "exit") window.location.assign("/");
    else sys(`perintah tidak dikenal: /${name}`);
  }

  const del = async (id: number) => { const r = await api("/api/ghosh/admin", { action: "message_delete", id }); if (r.ok) setMsgs((m) => m.filter((x) => x.id !== id)); };

  if (!inside) return <Gate state={state} onRequest={requestAccess} busy={busy} err={err} />;

  if (!booted)
    return (
      <Frame status="verifying">
        <Boot onDone={() => setBooted(true)} lines={[
          "identitas diverifikasi",
          "kanal terenkripsi dibuka",
          "alias disetel: Unknown",
          "jejak identitas dinonaktifkan",
        ]} />
      </Frame>
    );

  return (
    <Frame status={`${online} Unknown online`}>
      <div className={`gh-app${hidden ? " gh-blur" : ""}`}>
        <aside className="gh-rooms" aria-label="Room">
          {rooms.map((r) => (
            <button key={r.id} className={r.id === cur ? "on" : ""} onClick={() => setCur(r.id)} title={r.topic ?? ""}>
              <span>#{r.name}</span>
              {r.locked && <em>lock</em>}{!!r.ttl && <em>{ttlLabel(r.ttl)}</em>}
            </button>
          ))}
          {root && <a className="gh-console" href="/console">console →</a>}
        </aside>

        <section className="gh-main">
          <div className="gh-room-h">
            <b>#{room?.name ?? "…"}</b>
            <span className="gh-dim">{room?.topic ?? ""}{room?.ttl ? ` · pesan hilang ${ttlLabel(room.ttl)}` : ""}{locked ? " · read-only" : ""}</span>
          </div>
          <div className="gh-log" ref={logRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
            {msgs.length === 0 && <div className="gh-dim gh-empty">// kosong. belum ada yang bicara.</div>}
            {msgs.map((m) => (
              <div key={m.id} className={`gh-line${m.mine ? " mine" : ""}${m.sys ? " sys" : ""}`}>
                <span className="gh-time">{m.sys ? "sys " : hm(m.at)}</span>
                {!m.sys && <span className="gh-who">Unknown</span>}
                <span className="gh-text">
                  {m.fresh ? <Typed text={m.body} onTick={scroll} /> : m.body}
                </span>
                {root && !m.sys && m.id > 0 && <button className="gh-x" onClick={() => del(m.id)} aria-label="Hapus pesan" title="Hapus">×</button>}
              </div>
            ))}
          </div>
          <div className="gh-comp">
            <span className="gh-prompt">unknown@kevsoft:~$</span>
            <textarea
              className="gh-ta" rows={1} value={text} maxLength={1000} spellCheck={false} autoComplete="off" autoCapitalize="off"
              disabled={locked && !root}
              placeholder={locked && !root ? "room dikunci" : "ketik pesan atau /help"}
              onChange={(e) => { setText(e.target.value); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 140) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            />
            <button className="gh-send" onClick={send} disabled={sending || !text.trim()}>kirim</button>
          </div>
        </section>
      </div>
      {hidden && <div className="gh-veil">layar disamarkan</div>}
    </Frame>
  );
}
