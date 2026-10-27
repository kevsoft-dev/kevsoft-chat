"use client";
import { useState } from "react";
import Account from "./Account";
import { Logo } from "./ui";
import { USERNAME_RE, RESERVED } from "@/lib/mentions";

export default function Onboarding({ suggestedName }: { suggestedName: string }) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState(suggestedName);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const u = username.toLowerCase();
  const hint = !u ? "" : RESERVED.includes(u) ? "Username ini dicadangkan" : USERNAME_RE.test(u) ? "" : "3-20 karakter: huruf kecil, angka, _ . -";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const r = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, name }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || "Gagal menyimpan"); setBusy(false); return; }
    window.location.assign("/"); // muat ulang penuh, langsung masuk ke chat
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-top"><Logo /><Account name={suggestedName || "Akun"} /></div>
        <span className="eyebrow">Satu langkah lagi</span>
        <h1>Pilih username kamu</h1>
        <p className="muted">Username dipakai untuk chat, grup, dan tag <b>@{u || "username"}</b>. Tidak bisa diganti setelah disimpan.</p>
        <form onSubmit={submit}>
          <label htmlFor="un">Username</label>
          <div className="input-prefix"><span>@</span>
            <input id="un" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} placeholder="kevin" maxLength={20} required autoFocus autoComplete="off" autoCapitalize="none" />
          </div>
          {hint && <p className="error">{hint}</p>}
          <label htmlFor="nm">Nama tampilan</label>
          <input id="nm" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          <button disabled={busy || !USERNAME_RE.test(u) || RESERVED.includes(u)}>{busy ? "Menyimpan…" : "Masuk ke kevsoft-chat"}</button>
        </form>
        {err && <p className="error" role="alert">{err}</p>}
      </div>
    </main>
  );
}
