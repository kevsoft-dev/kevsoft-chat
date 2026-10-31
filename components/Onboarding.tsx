"use client";
import { useState } from "react";
import Account from "./Account";
import { Logo } from "./ui";
import ThemeToggle from "./ThemeToggle";
import { USERNAME_RE, RESERVED } from "@/lib/mentions";

const MIN = 8;

// Langkah setelah verifikasi email/Google: pilih username (sekali) dan buat password.
// reset = lupa password: hanya membuat password baru.
export default function Onboarding({ suggestedName, needUsername, reset, username: existing, next = "/chat" }: {
  suggestedName: string; needUsername: boolean; reset: boolean; username: string; next?: string;
}) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState(suggestedName);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const u = username.toLowerCase();
  const uName = needUsername ? u : existing;
  const hint = !needUsername || !u ? "" : RESERVED.includes(u) ? "Username ini dicadangkan" : USERNAME_RE.test(u) ? "" : "3-20 karakter: huruf kecil, angka, _ . -";
  const pwHint = !pw ? "" : pw.length < MIN ? `Minimal ${MIN} karakter` : uName && pw.toLowerCase() === uName ? "Password tidak boleh sama dengan username" : "";
  const mismatch = !!pw2 && pw !== pw2;
  const ready = pw.length >= MIN && !pwHint && pw === pw2 && (!needUsername || (USERNAME_RE.test(u) && !RESERVED.includes(u)));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = needUsername
        ? await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, name, password: pw }) })
        : await fetch("/api/me/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Gagal menyimpan"); setBusy(false); return; }
      window.location.assign(next); // muat ulang penuh, langsung masuk ke chat (atau halaman chat yang dituju)
    } catch { setErr("Jaringan bermasalah, coba lagi"); setBusy(false); }
  }

  return (
    <main className="auth">
      <ThemeToggle className="icon-btn theme-fab" />
      <div className="auth-card">
        <div className="auth-top"><Logo /><Account name={suggestedName || "Akun"} /></div>
        <span className="eyebrow">{reset ? "Lupa password" : "Satu langkah lagi"}</span>
        <h1>{reset ? "Buat password baru" : needUsername ? "Pilih username & password" : "Buat password kamu"}</h1>
        <p className="muted">
          {needUsername
            ? <>Username dipakai untuk chat, grup, dan tag <b>@{u || "username"}</b> (tidak bisa diganti). Setelah ini kamu masuk cukup dengan <b>username dan password</b>.</>
            : <>Email kamu sudah terverifikasi. Buat password supaya login berikutnya cukup dengan <b>@{existing}</b> dan password.</>}
        </p>
        <form onSubmit={submit}>
          {needUsername && (
            <>
              <label htmlFor="un">Username</label>
              <div className="input-prefix"><span>@</span>
                <input id="un" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} placeholder="kevin" maxLength={20} required autoFocus autoComplete="username" autoCapitalize="none" />
              </div>
              {hint && <p className="error">{hint}</p>}
              <label htmlFor="nm">Nama tampilan</label>
              <input id="nm" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
            </>
          )}
          <label htmlFor="pw">Password</label>
          <input id="pw" type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={`Minimal ${MIN} karakter`} maxLength={128} required autoFocus={!needUsername} autoComplete="new-password" />
          {pwHint && <p className="error">{pwHint}</p>}
          <label htmlFor="pw2">Ulangi password</label>
          <input id="pw2" type={show ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} maxLength={128} required autoComplete="new-password" />
          {mismatch && <p className="error">Password tidak sama</p>}
          <button type="button" className="ghost pw-toggle" onClick={() => setShow((s) => !s)}>{show ? "Sembunyikan password" : "Tampilkan password"}</button>
          <button disabled={busy || !ready}>{busy ? "Menyimpan…" : reset ? "Simpan password baru" : "Masuk ke kevsoft-chat"}</button>
        </form>
        {err && <p className="error" role="alert">{err}</p>}
      </div>
    </main>
  );
}
