"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Masuk dengan menautkan perangkat: kode 8 karakter tampil di sini, disetujui dari perangkat yang sudah login.
export default function LinkLogin({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState("");
  const [left, setLeft] = useState(0);
  const [state, setState] = useState<"loading" | "wait" | "expired" | "err">("loading");
  const [err, setErr] = useState("");
  const secret = useRef("");

  const start = useCallback(async () => {
    setState("loading"); setErr("");
    try {
      const r = await fetch("/api/auth/link/start", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Gagal meminta kode."); setState("err"); return; }
      secret.current = d.secret; setCode(d.code); setLeft(d.expires_in); setState("wait");
    } catch { setErr("Tidak bisa terhubung ke server."); setState("err"); }
  }, []);
  useEffect(() => { start(); }, [start]);

  useEffect(() => {
    if (state !== "wait") return;
    const tick = setInterval(() => setLeft((v) => { if (v <= 1) { setState("expired"); return 0; } return v - 1; }), 1000);
    const poll = setInterval(async () => {
      try {
        const r = await fetch("/api/auth/link/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, secret: secret.current }) });
        const d = await r.json().catch(() => ({}));
        if (d.status === "ok") window.location.assign("/chat");
        else if (d.status === "expired" || d.status === "gone") setState("expired");
      } catch {}
    }, 2000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [state, code]);

  const cells = code.replace("-", "").split("");
  return (
    <>
      <h2>Tautkan perangkat</h2>
      <p className="muted">Masuk tanpa password dengan bantuan perangkat lain yang sudah login ke kevsoft-chat.</p>
      <ol className="link-steps">
        <li>Buka kevsoft-chat di perangkat yang sudah login.</li>
        <li>Buka <b>Pengaturan</b> lalu <b>Perangkat tertaut</b>.</li>
        <li>Ketuk <b>Tautkan perangkat</b> dan masukkan kode di bawah.</li>
      </ol>
      {state === "err" ? <p className="error">{err}</p> : (
        <div className={`link-code${state === "expired" ? " dead" : ""}`} aria-live="polite" aria-label={`Kode ${code}`}>
          {(cells.length ? cells : Array(8).fill("•")).map((c, i) => <span key={i} className={i === 4 ? "gap" : ""}>{c}</span>)}
        </div>
      )}
      <p className="muted link-meta">{state === "wait" ? `Menunggu persetujuan… berlaku ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : state === "expired" ? "Kode kedaluwarsa." : state === "loading" ? "Membuat kode…" : ""}</p>
      <div className="split">
        <button type="button" className="ghost" onClick={onBack}>Kembali</button>
        <button type="button" className="ghost" onClick={start} disabled={state === "loading" || state === "wait"}>Kode baru</button>
      </div>
    </>
  );
}
