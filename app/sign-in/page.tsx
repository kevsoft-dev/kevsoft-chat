"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";

async function post(url: string, body: object) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Terjadi kesalahan");
  return d;
}

export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setErr(""); setBusy(true);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const sendCode = (e: React.FormEvent) => { e.preventDefault(); run(async () => { await post("/api/auth/otp/send", { email }); setStep("code"); }); };

  const verify = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
    const { ticket } = await post("/api/auth/otp/verify", { email, code });
    const res = await signIn!.create({ strategy: "ticket", ticket });
    if (res.status === "complete") { await setActive!({ session: res.createdSessionId }); router.replace("/"); }
  }); };

  const google = () => run(async () => {
    await signIn!.authenticateWithRedirect({ strategy: "oauth_google", redirectUrl: "/sso-callback", redirectUrlComplete: "/" });
  });

  return (
    <main className="auth">
      <div className="auth-card">
        <h1>Masuk ke Obrolan</h1>
        <p className="muted">Pesan pribadi, tersimpan aman di akun kamu.</p>

        {step === "email" ? (
          <form onSubmit={sendCode}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
            <button disabled={busy || !isLoaded}>Kirim kode masuk</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <label htmlFor="code">Kode 6 digit dikirim ke {email}</label>
            <input id="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
            <button disabled={busy || !isLoaded}>Masuk</button>
            <button type="button" className="ghost" onClick={() => { setStep("email"); setCode(""); }}>Ganti email</button>
          </form>
        )}

        <div className="or"><span>atau</span></div>
        <button className="ghost" onClick={google} disabled={busy || !isLoaded}>Lanjut dengan Google</button>
        {err && <p className="error" role="alert">{err}</p>}
      </div>
    </main>
  );
}
