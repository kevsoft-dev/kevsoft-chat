"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useSignIn } from "@clerk/nextjs";

async function post(url: string, body: object) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Terjadi kesalahan");
  return d;
}

const Google = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1a6.2 6.2 0 0 1 0-12.4c1.9 0 3.1.8 3.8 1.5l2.6-2.5A9.9 9.9 0 0 0 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4 9.6-9.8 0-.7-.1-1.2-.2-1.7Z" />
  </svg>
);

export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const sent = useRef(false);

  useEffect(() => { if (isSignedIn) router.replace("/"); }, [isSignedIn, router]);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  async function run(fn: () => Promise<void>) {
    setErr(""); setBusy(true);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const sendCode = () => run(async () => { await post("/api/auth/otp/send", { email }); setStep("code"); setCode(""); setWait(60); });
  const verify = (c: string) => run(async () => {
    const { ticket } = await post("/api/auth/otp/verify", { email, code: c });
    const res = await signIn!.create({ strategy: "ticket", ticket });
    if (res.status === "complete") { await setActive!({ session: res.createdSessionId }); router.replace("/"); }
  });
  const google = () => run(async () => {
    await signIn!.authenticateWithRedirect({ strategy: "oauth_google", redirectUrl: "/sso-callback", redirectUrlComplete: "/" });
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
        <div className="auth-top"><span className="brand-mark">◐</span><strong>kevsoft-chat</strong></div>
        <h2>{step === "email" ? "Masuk atau daftar" : "Cek email kamu"}</h2>
        <p className="muted">{step === "email" ? "Masukkan email, kami kirim kode 6 digit." : <>Kode 6 digit dikirim ke <b>{email}</b>.</>}</p>

        {step === "email" ? (
          <form onSubmit={(e) => { e.preventDefault(); sendCode(); }}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
            <button disabled={busy || !isLoaded}>{busy ? "Mengirim…" : "Kirim kode masuk"}</button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); verify(code); }}>
            <label htmlFor="code">Kode masuk</label>
            <input id="code" className="otp" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
            <button disabled={busy || !isLoaded || code.length !== 6}>{busy ? "Memeriksa…" : "Masuk"}</button>
            <div className="split">
              <button type="button" className="ghost" onClick={() => { setStep("email"); setCode(""); setErr(""); }}>Ganti email</button>
              <button type="button" className="ghost" disabled={busy || wait > 0} onClick={sendCode}>{wait > 0 ? `Kirim ulang (${wait})` : "Kirim ulang"}</button>
            </div>
          </form>
        )}

        <div className="or"><span>atau</span></div>
        <button className="ghost g" onClick={google} disabled={busy || !isLoaded}><Google />Lanjut dengan Google</button>
        {err && <p className="error" role="alert">{err}</p>}
      </section>
    </main>
  );
}
