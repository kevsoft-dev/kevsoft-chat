"use client";
import { useEffect, useRef, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from "firebase/auth";
import { Logo } from "@/components/ui";

type FirebaseWeb = { apiKey: string; authDomain: string; projectId: string; appId: string };

async function post(url: string, body: object) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Terjadi kesalahan");
  return d;
}

const Google = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.800 2.400 30.300 0 24 0 14.600 0 6.500 5.400 2.600 13.200l7.900 6.100C12.400 13.600 17.700 9.500 24 9.500Z" />
    <path fill="#4285F4" d="M46.500 24.500c0-1.600-.1-3.100-.4-4.500H24v9h12.700c-.6 3-2.300 5.500-4.800 7.200l7.600 5.900c4.400-4.100 7-10.100 7-17.600Z" />
    <path fill="#FBBC05" d="M10.500 28.700A14.500 14.500 0 0 1 9.500 24c0-1.600.3-3.200.9-4.700l-7.900-6.100A24 24 0 0 0 0 24c0 3.900.9 7.500 2.600 10.800l7.900-6.100Z" />
    <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.600-5.900c-2.100 1.400-4.900 2.300-8.300 2.300-6.300 0-11.600-4.100-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48Z" />
  </svg>
);

export default function SignInForm({ firebase }: { firebase: FirebaseWeb }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const sent = useRef(false);

  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  async function run(fn: () => Promise<void>) {
    setErr(""); setBusy(true);
    try { await fn(); } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  const sendCode = () => run(async () => { await post("/api/auth/otp/send", { email }); setStep("code"); setCode(""); setWait(60); setBusy(false); });
  const verify = (c: string) => run(async () => { await post("/api/auth/otp/verify", { email, code: c }); window.location.assign("/"); });
  const google = () => run(async () => {
    const auth = getAuth(getApps().length ? getApp() : initializeApp(firebase));
    try {
      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      await post("/api/auth/google", { idToken: await res.user.getIdToken() });
      await signOut(auth);
    } catch (e: any) {
      if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") { setBusy(false); return; }
      if (e?.code === "auth/unauthorized-domain") throw new Error("Domain belum diizinkan di Firebase (Authentication → Settings → Authorized domains)");
      if (e?.code === "auth/operation-not-allowed") throw new Error("Provider Google belum diaktifkan di Firebase");
      throw e;
    }
    window.location.assign("/");
  });

  useEffect(() => {
    if (step === "code" && /^\d{6}$/.test(code) && !busy && !sent.current) { sent.current = true; verify(code).finally(() => { sent.current = false; }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  return (
    <main className="login">
      <div className="login-bg" aria-hidden><i className="orbit o1" /><i className="orbit o2" /><i className="glow" /></div>

      <section className="login-hero">
        <span className="status"><i className="dot" />Komunitas &amp; chat publik kevsoft</span>
        <h1><span className="soft">Ngobrol,</span><span className="bright">tanpa ribet.</span></h1>
        <p>Satu tempat untuk komunitas kevsoft: grup, chat pribadi, tag <b>@username</b>, dan asisten AI <b>@kev-ai</b> yang siap menjawab kapan saja.</p>
        <ul className="pills"><li>Grup &amp; komunitas</li><li>Chat pribadi</li><li>@tag teman</li><li>Kev-Ai</li></ul>
      </section>

      <section className="auth-card login-card">
        <div className="auth-top"><Logo /><strong>kevsoft-chat</strong></div>
        <h2>{step === "email" ? "Masuk atau daftar" : "Cek email kamu"}</h2>
        <p className="muted">{step === "email" ? "Masukkan email, kami kirim kode 6 digit." : <>Kode 6 digit dikirim ke <b>{email}</b>.</>}</p>

        {step === "email" ? (
          <form onSubmit={(e) => { e.preventDefault(); sendCode(); }}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
            <button disabled={busy}>{busy ? "Mengirim…" : "Kirim kode masuk"}</button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); verify(code); }}>
            <label htmlFor="code">Kode masuk</label>
            <input id="code" className="otp" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
            <button disabled={busy || code.length !== 6}>{busy ? "Memeriksa…" : "Masuk"}</button>
            <div className="split">
              <button type="button" className="ghost" onClick={() => { setStep("email"); setCode(""); setErr(""); }}>Ganti email</button>
              <button type="button" className="ghost" disabled={busy || wait > 0} onClick={sendCode}>{wait > 0 ? `Kirim ulang (${wait})` : "Kirim ulang"}</button>
            </div>
          </form>
        )}

        <div className="or"><span>atau</span></div>
        <button className="ghost g" onClick={google} disabled={busy}><Google />Lanjut dengan Google</button>
        {err && <p className="error" role="alert">{err}</p>}
      </section>
    </main>
  );
}
