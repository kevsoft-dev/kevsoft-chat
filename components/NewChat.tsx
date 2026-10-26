"use client";
import { useEffect, useState } from "react";
import { Avatar, Icon, type UserLite } from "./ui";

export default function NewChat({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [mode, setMode] = useState<"dm" | "group">("dm");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<UserLite[]>([]);
  const [picked, setPicked] = useState<UserLite[]>([]);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/api/users?q=${encodeURIComponent(q.replace(/^@/, ""))}`);
      if (r.ok) setRes(await r.json());
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function create(body: object) {
    setErr(""); setBusy(true);
    const r = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Gagal membuat chat");
    onCreated(d.id);
  }
  const toggle = (u: UserLite) => setPicked((p) => (p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]));

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Chat baru">
        <header>
          <h2>Chat baru</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon n="close" /></button>
        </header>
        <div className="seg">
          <button className={mode === "dm" ? "on" : ""} onClick={() => setMode("dm")}>Pribadi</button>
          <button className={mode === "group" ? "on" : ""} onClick={() => setMode("group")}>Grup baru</button>
        </div>
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
      </div>
    </div>
  );
}
