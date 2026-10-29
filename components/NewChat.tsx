"use client";
import { useEffect, useState } from "react";
import { Avatar, Icon, type UserLite } from "./ui";
import { parseInvite } from "@/lib/invite";

type GroupHit = { id: string; title: string | null; handle: string; description: string | null; avatar_url: string | null; member_count: number; joined: boolean };

export default function NewChat({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [mode, setMode] = useState<"dm" | "group" | "join">("dm");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<UserLite[]>([]);
  const [picked, setPicked] = useState<UserLite[]>([]);
  const [title, setTitle] = useState("");
  const [jq, setJq] = useState("");
  const [hits, setHits] = useState<GroupHit[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === "join") return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/users?q=${encodeURIComponent(q.replace(/^@/, ""))}`);
      if (r.ok) setRes(await r.json());
    }, 200);
    return () => clearTimeout(t);
  }, [q, mode]);

  // Cari grup publik (yang punya username) saat mengetik di tab Gabung.
  useEffect(() => {
    if (mode !== "join") return;
    const term = jq.trim().replace(/^@/, "");
    if (term.length < 2 || /\/join\//.test(term)) { setHits([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/conversations/join?q=${encodeURIComponent(term)}`);
      if (r.ok) setHits(await r.json());
    }, 250);
    return () => clearTimeout(t);
  }, [jq, mode]);

  async function create(body: object) {
    setErr(""); setBusy(true);
    const r = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Gagal membuat chat");
    onCreated(d.id);
  }

  async function join(body: { code?: string; handle?: string }) {
    const r = await fetch("/api/conversations/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  }

  // Tempel link undangan / kode / @username lalu gabung.
  async function joinFromInput() {
    const p = parseInvite(jq);
    if (!p.code && !p.handle) return setErr("Tempel link undangan, kode, atau @username grup");
    setErr(""); setBusy(true);
    let out = p.code ? await join({ code: p.code }) : null;
    if ((!out || !out.ok) && p.handle && (!out || out.status === 404)) out = await join({ handle: p.handle });
    setBusy(false);
    if (!out || !out.ok) return setErr(out?.d?.error || "Gagal bergabung");
    onCreated(out.d.id);
  }

  async function joinHit(g: GroupHit) {
    if (g.joined) return onCreated(g.id);
    setErr(""); setBusy(true);
    const out = await join({ handle: g.handle });
    setBusy(false);
    if (!out.ok) return setErr(out.d?.error || "Gagal bergabung");
    onCreated(out.d.id);
  }

  const toggle = (u: UserLite) => setPicked((p) => (p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]));
  const parsed = parseInvite(jq);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Chat baru">
        <header>
          <h2>{mode === "join" ? "Gabung grup" : "Chat baru"}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon n="close" /></button>
        </header>
        <div className="seg">
          <button className={mode === "dm" ? "on" : ""} onClick={() => { setMode("dm"); setErr(""); }}>Pribadi</button>
          <button className={mode === "group" ? "on" : ""} onClick={() => { setMode("group"); setErr(""); }}>Grup baru</button>
          <button className={mode === "join" ? "on" : ""} onClick={() => { setMode("join"); setErr(""); }}>Gabung</button>
        </div>

        {mode === "join" ? (
          <>
            <div className="search"><Icon n="link" size={18} />
              <input autoFocus placeholder="Tempel link undangan, atau cari @username grup" value={jq}
                onChange={(e) => { setJq(e.target.value); setErr(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && (parsed.code || /\/join\//.test(jq))) joinFromInput(); }} />
            </div>
            <ul className="pick-list">
              {hits.length === 0 && <li className="empty">{jq.trim().length < 2 ? "Link undangan bersifat privat. Grup yang punya username bisa dicari di sini." : "Tidak ada grup publik ditemukan."}</li>}
              {hits.map((g) => (
                <li key={g.id}>
                  <button className="conv" onClick={() => joinHit(g)} disabled={busy}>
                    <Avatar name={g.title || g.handle} src={g.avatar_url} kind="group" size={42} />
                    <span className="meta"><b>{g.title || g.handle}</b><span className="preview">@{g.handle} · {g.member_count} anggota</span></span>
                    <span className="tick">{g.joined ? "Buka" : "Gabung"}</span>
                  </button>
                </li>
              ))}
            </ul>
            {err && <p className="error" role="alert">{err}</p>}
            {(parsed.code || parsed.handle) && /(\/join\/|^@)|^[A-Za-z0-9_-]{16}$/.test(jq.trim()) && (
              <button className="primary" disabled={busy} onClick={joinFromInput}>{busy ? "Bergabung…" : parsed.code ? "Gabung lewat link" : "Gabung lewat username"}</button>
            )}
          </>
        ) : (
          <>
            {mode === "group" && (
              <input className="field" placeholder="Nama grup" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
            )}
            {picked.length > 0 && (
              <div className="chips">
                {picked.map((u) => <button key={u.id} className="chip" onClick={() => toggle(u)}>@{u.username} <Icon n="close" size={12} /></button>)}
              </div>
            )}
            <div className="search"><Icon n="search" size={18} /><input autoFocus placeholder="Cari username atau nama" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <ul className="pick-list">
              {res.length === 0 && <li className="empty">Tidak ada pengguna ditemukan.</li>}
              {res.map((u) => (
                <li key={u.id}>
                  <button className="conv" onClick={() => (mode === "dm" ? create({ type: "dm", username: u.username }) : toggle(u))} disabled={busy}>
                    <Avatar name={u.name || u.username} src={u.avatar_url} size={42} />
                    <span className="meta"><b>{u.name || u.username}</b><span className="preview">@{u.username}</span></span>
                    {mode === "group" && picked.some((x) => x.id === u.id) && <span className="tick"><Icon n="check" size={18} /></span>}
                  </button>
                </li>
              ))}
            </ul>
            {err && <p className="error" role="alert">{err}</p>}
            {mode === "group" && (
              <button className="primary" disabled={busy || !title.trim() || picked.length === 0}
                onClick={() => create({ type: "group", title, usernames: picked.map((p) => p.username) })}>
                Buat grup ({picked.length} anggota)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
