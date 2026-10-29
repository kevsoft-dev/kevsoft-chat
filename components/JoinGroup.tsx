"use client";
import { useState } from "react";
import { Avatar } from "./ui";

// Halaman konfirmasi gabung grup lewat link undangan (kode acak).
export default function JoinGroup({ code, title, description, memberCount, avatar }: {
  code: string; title: string; description: string | null; memberCount: number; avatar: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function join() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/conversations/join", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Gagal bergabung"); setBusy(false); return; }
      window.location.assign(`/?open=${d.id}`);
    } catch { setErr("Jaringan bermasalah"); setBusy(false); }
  }

  return (
    <main className="auth">
      <div className="auth-card join-card">
        <Avatar name={title} src={avatar} kind="group" size={96} />
        <span className="eyebrow">Undangan grup</span>
        <h1>{title}</h1>
        <p className="muted">{memberCount} anggota</p>
        {description && <p className="desc">{description}</p>}
        {err && <p className="error" role="alert">{err}</p>}
        <button className="primary" onClick={join} disabled={busy}>{busy ? "Bergabung…" : "Gabung grup"}</button>
        <a className="link" href="/">Batal</a>
      </div>
    </main>
  );
}
