"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type State = "none" | "pending" | "approved" | "rejected" | "revoked" | "lockdown" | "root";
type Room = { id: string; name: string; topic: string | null; locked: boolean; ttl: number | null; last_id: number; last_mention_id: number };
type Dm = { id: string; num: number; alias: string; ttl: number | null; real: string | null; real_username: string | null; revealed_by_me: boolean; last_id: number };
type Msg = { id: number; body: string; at: string; mine: boolean; num: number; alias: string; real: string | null; real_username: string | null };
type Active = { kind: "room" | "dm"; id: string };

const hm = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":");
const day = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
const ttlLabel = (s: number | null) => (!s ? "" : s < 3600 ? `${s / 60} menit` : s < 86400 ? `${s / 3600} jam` : `${s / 86400} hari`);

// Tag @unknown1234 (tanpa lookbehind supaya jalan di semua browser).
const MENTION = /(^|[^\w@])(@unknown(\d{4,5}))(?!\d)/gi;
const aliasOf = (n: number) => `Unknown${n}`;
type Contacts = Record<string, string>;

async function api(url: string, body?: object) {
  try {
    const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: { error: "Koneksi terputus" } }; }
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [dms, setDms] = useState<Dm[]>([]);
  const [me, setMe] = useState<string>("");
  const [cur, setCur] = useState<Active | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [locked, setLocked] = useState(false);
  const [online, setOnline] = useState(0);
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState(false);
  const [sending, setSending] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [flash, setFlash] = useState("");
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [contacts, setContacts] = useState<Contacts>({});
  const [sheet, setSheet] = useState<number | null>(null);
  const [caret, setCaret] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastId = useRef(0);
  const curRef = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const flashT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = (t: string) => { setFlash(t); clearTimeout(flashT.current); flashT.current = setTimeout(() => setFlash(""), 2600); };

  const inside = state === "root" || state === "approved";
  const curRoom = cur?.kind === "room" ? rooms.find((r) => r.id === cur.id) ?? null : null;
  const curDm = cur?.kind === "dm" ? dms.find((r) => r.id === cur.id) ?? null : null;

  const scroll = useCallback(() => { const el = logRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, []);

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
    if (!r.ok) return;
    setRooms(r.data.rooms); setDms(r.data.dms); setMe(r.data.me?.alias ?? "");
    setCur((c) => c ?? (r.data.rooms[0] ? { kind: "room", id: r.data.rooms[0].id } : null));
  }, []);
  useEffect(() => { if (inside) { loadRooms(); const t = setInterval(loadRooms, 6000); return () => clearInterval(t); } }, [inside, loadRooms]);

  // Kontak tersimpan HANYA di perangkat ini (localStorage), terpisah per akun. Server tidak pernah melihat nama kontak.
  const ckey = me ? `gh_contacts_${me}` : "";
  useEffect(() => {
    if (!ckey) return;
    try { const v = JSON.parse(localStorage.getItem(ckey) || "{}"); setContacts(v && typeof v === "object" ? v : {}); } catch { setContacts({}); }
  }, [ckey]);
  const persist = (c: Contacts) => { setContacts(c); try { if (ckey) localStorage.setItem(ckey, JSON.stringify(c)); } catch {} };
  const nameOf = (num: number, real?: string | null) => contacts[num] || real || aliasOf(num);
  const editContact = (num: number) => {
    const cur0 = contacts[num] ?? "";
    const v = window.prompt(`Nama untuk ${aliasOf(num)} (hanya terlihat di perangkat ini):`, cur0);
    if (v === null) return;
    const name = v.trim().slice(0, 40);
    const next = { ...contacts };
    if (name) next[num] = name; else delete next[num];
    persist(next); say(name ? "Kontak disimpan" : "Kontak dihapus");
  };
  const removeContact = (num: number) => { const n = { ...contacts }; delete n[num]; persist(n); say("Kontak dihapus"); };

  useEffect(() => { curRef.current = cur?.id ?? null; lastId.current = 0; setMsgs([]); stick.current = true; }, [cur?.id]);

  // Polling pesan.
  useEffect(() => {
    if (!inside || !cur) return;
    const id = cur.id;
    let alive = true;
    const poll = async () => {
      if (!alive || curRef.current !== id) return;
      const r = await api(`/api/ghosh/messages?room=${id}&after=${lastId.current}`);
      if (!alive || curRef.current !== id) return;
      if (r.status === 404) { setCur(null); return; }
      if (r.ok) {
        setLocked(!!r.data.locked); setOnline(r.data.online ?? 0);
        const list: Msg[] = r.data.messages;
        if (list.length) {
          lastId.current = list[list.length - 1].id;
          setMsgs((m) => [...m, ...list]);
          setSeen((s) => ({ ...s, [id]: lastId.current }));
        }
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
    if (!body || sending || !cur) return;
    setSending(true);
    const r = await api("/api/ghosh/messages", { room: cur.id, body });
    setSending(false);
    if (r.ok) { setText(""); stick.current = true; } else say(r.data.error || "Gagal mengirim");
  }

  async function openDm(num: number) {
    const r = await api("/api/ghosh/dm", { num });
    if (!r.ok) { say(r.data.error || "Gagal membuka chat"); return; }
    await loadRooms();
    setCur({ kind: "dm", id: r.data.id }); setDrawer(false);
  }

  async function reveal(on: boolean) {
    if (!curDm) return;
    if (on && !window.confirm(`Kenalkan diri ke ${curDm.real ?? curDm.alias}? Dia akan melihat nama asli dan username kamu. Orang lain tetap melihat Unknown.`)) return;
    if (!on && !window.confirm("Cabut? Nama kamu tidak lagi terlihat di sisinya, tapi yang sudah terlanjur dilihat tidak bisa ditarik.")) return;
    const r = await api("/api/ghosh/reveal", { num: curDm.num, on });
    if (r.ok) { say(on ? "Identitasmu terlihat oleh dia" : "Identitas disembunyikan lagi"); loadRooms(); } else say(r.data.error || "Gagal");
  }

  const del = async (id: number) => {
    if (!window.confirm("Hapus pesan ini untuk semua orang?")) return;
    const r = await api("/api/ghosh/admin", { action: "message_delete", id });
    if (r.ok) setMsgs((m) => m.filter((x) => x.id !== id));
  };

  // Chat yang belum pernah dibuka dianggap sudah terbaca saat daftar pertama dimuat (hook harus sebelum return dini).
  useSeenInit(rooms, dms, seen, setSeen);

  const myNum = Number(me.replace(/\D/g, "")) || 0;
  const renderBody = (body: string) => {
    const out: React.ReactNode[] = []; let last = 0, k = 0;
    for (const m of body.matchAll(MENTION)) {
      const start = (m.index ?? 0) + m[1].length, num = Number(m[3]);
      if (start > last) out.push(body.slice(last, start));
      const nm = contacts[num];
      out.push(<button key={k++} className={`gh-mention${num === myNum ? " me" : ""}`} onClick={() => setSheet(num)}>{nm ? `@${nm}` : m[2]}</button>);
      last = start + m[2].length;
    }
    if (last < body.length) out.push(body.slice(last));
    return out;
  };
  const pinged = (b: string) => { for (const m of b.matchAll(MENTION)) if (Number(m[3]) === myNum) return true; return false; };

  // Saran tag: orang yang pernah bicara di room ini + kontak tersimpan.
  const before = text.slice(0, caret);
  const q = before.match(/(?:^|\s)@([a-z0-9]*)$/i);
  const cands: { num: number; label: string }[] = [];
  if (q) {
    const pool = new Map<number, string | null>();
    for (const m of msgs) if (!m.mine && m.num) pool.set(m.num, m.real);
    for (const k of Object.keys(contacts)) pool.set(Number(k), pool.get(Number(k)) ?? null);
    const needle = q[1].toLowerCase().replace(/^unknown/, "");
    for (const [num, real] of pool) {
      if (num === myNum) continue;
      const label = nameOf(num, real);
      if (!needle || String(num).startsWith(needle) || label.toLowerCase().includes(q[1].toLowerCase())) cands.push({ num, label });
      if (cands.length >= 6) break;
    }
  }
  const insertTag = (num: number) => {
    const pos = taRef.current?.selectionStart ?? text.length;
    const head = text.slice(0, pos).replace(/@[a-z0-9]*$/i, "");
    const tag = `@${aliasOf(num)} `;
    const next = head + tag + text.slice(pos);
    setText(next);
    requestAnimationFrame(() => { const el = taRef.current; if (el) { el.focus(); el.setSelectionRange((head + tag).length, (head + tag).length); setCaret((head + tag).length); } });
  };

  if (!inside) return <Gate state={state} onRequest={requestAccess} busy={busy} err={err} />;

  const mentioned = (r: Room) => r.last_mention_id > (seen[r.id] ?? Number.MAX_SAFE_INTEGER) && cur?.id !== r.id;
  const unread = (id: string, last: number) => last > (seen[id] ?? Number.MAX_SAFE_INTEGER) && cur?.id !== id;
  const title = curRoom ? `#${curRoom.name}` : curDm ? nameOf(curDm.num, curDm.real) : "…";
  const sub = curRoom
    ? [curRoom.topic, curRoom.ttl ? `pesan hilang ${ttlLabel(curRoom.ttl)}` : "", locked ? "hanya baca" : ""].filter(Boolean).join(" · ")
    : curDm ? [curDm.real ? `@${curDm.real_username ?? ""} · ${curDm.alias}` : contacts[curDm.num] ? curDm.alias : "chat pribadi", curDm.ttl ? `pesan hilang ${ttlLabel(curDm.ttl)}` : ""].filter(Boolean).join(" · ") : "";

  let prevDay = "", prevNum = -1, prevT = 0;
  return (
    <Frame status={`${me} · ${online} online`}>
      <div className={`gh-app${hidden ? " gh-blur" : ""}`}>
        <aside className={`gh-rooms${drawer ? " open" : ""}`} aria-label="Daftar chat">
          <div className="gh-me">Kamu: <b>{me}</b></div>
          <div className="gh-sec">Room</div>
          {rooms.map((r) => (
            <button key={r.id} className={cur?.id === r.id ? "on" : ""} onClick={() => { setCur({ kind: "room", id: r.id }); setDrawer(false); }}>
              <span>#{r.name}</span>{r.locked && <em>lock</em>}{mentioned(r) ? <i className="gh-at">@</i> : unread(r.id, r.last_id) && <i className="gh-dot" />}
            </button>
          ))}
          <div className="gh-sec">Pribadi</div>
          {!dms.length && <div className="gh-dim gh-none">Belum ada. Ketuk nama Unknown di room untuk memulai chat pribadi.</div>}
          {dms.map((d) => (
            <button key={d.id} className={cur?.id === d.id ? "on" : ""} onClick={() => { setCur({ kind: "dm", id: d.id }); setDrawer(false); }}>
              <span>{nameOf(d.num, d.real)}</span>{unread(d.id, d.last_id) && <i className="gh-dot" />}
            </button>
          ))}
          {Object.keys(contacts).length > 0 && <div className="gh-sec">Kontak</div>}
          {Object.entries(contacts).map(([k, nm]) => (
            <button key={k} onClick={() => { setSheet(Number(k)); }}>
              <span>{nm} <span className="gh-dim">· {aliasOf(Number(k))}</span></span>
            </button>
          ))}
          {root && <a className="gh-console" href="/console">console →</a>}
        </aside>

        <section className="gh-main">
          <div className="gh-room-h">
            <button className="gh-burger" onClick={() => setDrawer((v) => !v)} aria-label="Daftar chat">☰</button>
            <div className="gh-title"><b>{title}</b><span className="gh-dim">{sub}</span></div>
            {curDm && <button className="gh-chip" onClick={() => editContact(curDm.num)}>{contacts[curDm.num] ? "ubah nama" : "simpan kontak"}</button>}
            {curDm && (curDm.revealed_by_me
              ? <button className="gh-chip on" onClick={() => reveal(false)}>identitas terlihat · cabut</button>
              : <button className="gh-chip" onClick={() => reveal(true)}>kenalkan diri</button>)}
          </div>
          {drawer && <div className="gh-scrim" onClick={() => setDrawer(false)} />}

          <div className="gh-log" ref={logRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
            {msgs.length === 0 && <div className="gh-dim gh-empty">Belum ada pesan.</div>}
            {msgs.map((m) => {
              const d = day(m.at), t = new Date(m.at).getTime();
              const showDay = d !== prevDay;
              const showName = cur?.kind === "room" && !m.mine && (showDay || m.num !== prevNum || t - prevT > 120000);
              prevDay = d; prevNum = m.num; prevT = t;
              return (
                <div key={m.id}>
                  {showDay && <div className="gh-day">{d}</div>}
                  <div className={`gh-row${m.mine ? " mine" : ""}`}>
                    <div className={`gh-bub${!m.mine && pinged(m.body) ? " ping" : ""}`}>
                      {showName && (
                        <button className="gh-name" onClick={() => m.num && setSheet(m.num)} title="Menu kontak">
                          {contacts[m.num] || m.real ? <>{nameOf(m.num, m.real)} <span className="gh-dim">· {m.alias}</span></> : m.alias}
                        </button>
                      )}
                      <span className="gh-body">{renderBody(m.body)}</span>
                      <span className="gh-meta">{hm(m.at)}</span>
                    </div>
                    {root && cur?.kind === "room" && <button className="gh-x" onClick={() => del(m.id)} aria-label="Hapus pesan" title="Hapus">×</button>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="gh-comp">
            {cands.length > 0 && (
              <div className="gh-sugg" role="listbox">
                {cands.map((c) => (
                  <button key={c.num} role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => insertTag(c.num)}>
                    {c.label} <span className="gh-dim">@{aliasOf(c.num)}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={taRef}
              className="gh-ta" rows={1} value={text} maxLength={1000} spellCheck={false} autoComplete="off"
              disabled={!cur || (locked && !root && cur.kind === "room")}
              placeholder={locked && !root && cur?.kind === "room" ? "Room dikunci" : "Tulis pesan"}
              onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 140) + "px"; }}
              onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)} onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            />
            <button className="gh-send" onClick={send} disabled={sending || !text.trim() || !cur}>kirim</button>
          </div>
        </section>
      </div>
      {sheet !== null && (
        <div className="gh-sheet-wrap" onClick={() => setSheet(null)}>
          <div className="gh-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Menu kontak">
            <div className="gh-sheet-h">
              <b>{contacts[sheet] ?? aliasOf(sheet)}</b>
              <span className="gh-dim">{contacts[sheet] ? aliasOf(sheet) : sheet === myNum ? "ini kamu" : "belum disimpan"}</span>
            </div>
            {sheet !== myNum && <button onClick={() => { const n = sheet; setSheet(null); openDm(n); }}>Chat pribadi</button>}
            {sheet !== myNum && <button onClick={() => { const n = sheet; setSheet(null); editContact(n); }}>{contacts[sheet] ? "Ubah nama kontak" : "Simpan kontak"}</button>}
            {contacts[sheet] && <button onClick={() => { removeContact(sheet); setSheet(null); }}>Hapus dari kontak</button>}
            {sheet !== myNum && <button onClick={() => { const n = sheet; setSheet(null); setText((t) => `${t}${t && !/\s$/.test(t) ? " " : ""}@${aliasOf(n)} `); taRef.current?.focus(); }}>Tag di pesan</button>}
            <p className="gh-dim gh-sheet-note">Nama kontak hanya tersimpan di perangkat ini. Orang itu dan server tidak bisa melihatnya.</p>
            <button className="gh-sheet-x" onClick={() => setSheet(null)}>Tutup</button>
          </div>
        </div>
      )}
      {flash && <div className="gc-flash">{flash}</div>}
      {hidden && <div className="gh-veil">layar disamarkan</div>}
    </Frame>
  );
}

// Tandai semua chat yang ada sebagai "sudah terbaca" saat pertama kali muncul, supaya titik belum-dibaca hanya muncul untuk pesan baru.
function useSeenInit(rooms: Room[], dms: Dm[], seen: Record<string, number>, setSeen: (f: (s: Record<string, number>) => Record<string, number>) => void) {
  useEffect(() => {
    const add: Record<string, number> = {};
    for (const r of [...rooms, ...dms]) if (!(r.id in seen)) add[r.id] = r.last_id;
    if (Object.keys(add).length) setSeen((s) => ({ ...add, ...s }));
  }, [rooms, dms, seen, setSeen]);
}
