"use client";
import { useEffect, useRef, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, getRedirectResult, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { Logo } from "@/components/ui";
import ThemeToggle from "@/components/ThemeToggle";

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

const fbAuth = (cfg: FirebaseWeb) => getAuth(getApps().length ? getApp() : initializeApp(cfg));

const googleError = (e: any) => {
  switch (e?.code) {
    case "auth/unauthorized-domain": return "Domain ini belum diizinkan di Firebase (Authentication → Settings → Authorized domains)";
    case "auth/operation-not-allowed": return "Login Google belum diaktifkan di Firebase (Authentication → Sign-in method → Google)";
    case "auth/network-request-failed": return "Jaringan bermasalah, coba lagi";
    default: return e?.message || "Login Google gagal";
  }
};

export default function SignInForm({ firebase }: { firebase: FirebaseWeb }) {
  const [mode, setMode] = useState<"login" | "verify">("login");
  const [forgot, setForgot] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
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
  const dest = () => {
    if (forgot) return "/chat?reset=1";
    try {
      const n = new URLSearchParams(window.location.search).get("next") || "";
      // hanya path internal aman
      if (n.startsWith("/") && !n.startsWith("//") && !n.includes("://")) return n;
    } catch {}
    return "/chat";
  };
  const verify = (c: string) => run(async () => { await post("/api/auth/otp/verify", { email, code: c }); window.location.assign(dest()); });
  const loginPw = () => run(async () => { await post("/api/auth/login", { username: username.trim().toLowerCase().replace(/^@/, ""), password }); window.location.assign(dest()); });
  const go = (m: "login" | "verify", f = false) => { setMode(m); setForgot(f); setErr(""); setStep("email"); setCode(""); };
  const google = () => run(async () => {
    const auth = fbAuth(firebase);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const res = await signInWithPopup(auth, provider);
      await post("/api/auth/google", { idToken: await res.user.getIdToken() });
      await signOut(auth);
      window.location.assign(dest());
    } catch (e: any) {
      if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") { setBusy(false); return; }
      // Popup diblokir (umum di browser HP / in-app browser): pakai redirect.
      if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") {
        try { sessionStorage.setItem("kc_forgot", forgot ? "1" : ""); } catch {}
        await signInWithRedirect(auth, provider);
        return;
      }
      throw new Error(googleError(e));
    }
  });

  // Menyelesaikan login Google yang memakai redirect.
  useEffect(() => {
    (async () => {
      try {
        const auth = fbAuth(firebase);
        const res = await getRedirectResult(auth);
        if (!res) return;
        setBusy(true);
        await post("/api/auth/google", { idToken: await res.user.getIdToken() });
        await signOut(auth);
        let f = false; try { f = sessionStorage.getItem("kc_forgot") === "1"; sessionStorage.removeItem("kc_forgot"); } catch {}
        window.location.assign(f ? "/chat?reset=1" : dest());
      } catch (e: any) { setErr(googleError(e)); setBusy(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === "code" && /^\d{6}$/.test(code) && !busy && !sent.current) { sent.current = true; verify(code).finally(() => { sent.current = false; }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  return (
    <main className="login">
      <ThemeToggle className="icon-btn theme-fab" />
      <div className="login-bg" aria-hidden><i className="orbit o1" /><i className="orbit o2" /><i className="glow" /></div>

      <section className="login-hero">
        <span className="status"><i className="dot" />Komunitas &amp; chat publik kevsoft</span>
        <h1><span className="soft">Ngobrol,</span><span className="bright">tanpa ribet.</span></h1>
        <p>Satu tempat untuk komunitas kevsoft: grup, chat pribadi, tag <b>@username</b>, dan asisten AI <b>@kev-ai</b> yang siap menjawab kapan saja.</p>
        <ul className="pills"><li>Grup &amp; komunitas</li><li>Chat pribadi</li><li>@tag teman</li><li>Kev-Ai</li></ul>
      </section>

      <section className="auth-card login-card">
        <div className="auth-top"><Logo /><strong>kevsoft-chat</strong></div>

        {mode === "login" ? (
          <>
            <h2>Masuk</h2>
            <p className="muted">Pakai username dan password kamu.</p>
            <form onSubmit={(e) => { e.preventDefault(); loginPw(); }}>
              <label htmlFor="user">Username</label>
              <div className="input-prefix"><span>@</span>
                <input id="user" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} placeholder="username" maxLength={21} required autoFocus autoComplete="username" autoCapitalize="none" />
              </div>
              <label htmlFor="pass">Password</label>
              <input id="pass" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} required autoComplete="current-password" />
              <button type="button" className="ghost pw-toggle" onClick={() => setShowPw((v) => !v)}>{showPw ? "Sembunyikan password" : "Tampilkan password"}</button>
              <button disabled={busy || !username || !password}>{busy ? "Memeriksa…" : "Masuk"}</button>
            </form>
            <div className="or"><span>belum punya akun?</span></div>
            <div className="split">
              <button type="button" className="ghost" onClick={() => go("verify")}>Daftar</button>
              <button type="button" className="ghost" onClick={() => go("verify", true)}>Lupa password</button>
            </div>
          </>
        ) : (
          <>
            <h2>{step === "code" ? "Cek email kamu" : forgot ? "Verifikasi untuk reset" : "Daftar atau verifikasi"}</h2>
            <p className="muted">
              {step === "code" ? <>Kode 6 digit dikirim ke <b>{email}</b>.</>
                : forgot ? "Verifikasi email atau Google kamu, lalu buat password baru."
                : "Verifikasi email atau Google. Setelah itu kamu diminta membuat password untuk login berikutnya."}
            </p>

            {step === "email" && (
              <>
                <button className="ghost g google-main" onClick={google} disabled={busy}><Google />Lanjut dengan Google</button>
                <div className="or"><span>atau pakai email</span></div>
              </>
            )}

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
                <button disabled={busy || code.length !== 6}>{busy ? "Memeriksa…" : "Verifikasi"}</button>
                <div className="split">
                  <button type="button" className="ghost" onClick={() => { setStep("email"); setCode(""); setErr(""); }}>Ganti email</button>
                  <button type="button" className="ghost" disabled={busy || wait > 0} onClick={sendCode}>{wait > 0 ? `Kirim ulang (${wait})` : "Kirim ulang"}</button>
                </div>
              </form>
            )}
            <button type="button" className="ghost back-login" onClick={() => go("login")}>Sudah punya password? Masuk dengan username</button>
          </>
        )}

        {err && <p className="error" role="alert">{err}</p>}
      </section>
    </main>
  );
}
