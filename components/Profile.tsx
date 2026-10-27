"use client";
import { useEffect, useRef, useState } from "react";
import { usePref } from "@/lib/prefs";
import { Avatar, Icon, RoleBadge, isStaffRole, type Me } from "./ui";
import { useTheme } from "./ThemeToggle";

// Foto dipotong persegi dan diperkecil di browser (256px WebP/JPEG, ~10-30 KB) sebelum diunggah.
async function toSquare(file: File, size = 256): Promise<Blob> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { bmp = await createImageBitmap(file); }
  const s = Math.min(bmp.width, bmp.height);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  cv.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  bmp.close?.();
  const webp = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/webp", 0.82));
  if (webp && webp.type === "image/webp") return webp;
  const jpg = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/jpeg", 0.85));
  if (!jpg) throw new Error("Gagal memproses foto");
  return jpg;
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`sw${on ? " on" : ""}`} onClick={() => onChange(!on)}><i /></button>;
}

function EditField({ label, value, placeholder, max, multiline, onSave, note }: {
  label: string; value: string; placeholder?: string; max: number; multiline?: boolean; note?: string;
  onSave: (v: string) => Promise<string | null>;
}) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (!edit) setV(value); }, [value, edit]);

  async function save() {
    const t = v.trim();
    if (t === value) { setEdit(false); return; }
    setBusy(true); setErr("");
    const e = await onSave(t);
    setBusy(false);
    if (e) { setErr(e); return; }
    setEdit(false); setOk(true); setTimeout(() => setOk(false), 1500);
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setEdit(false); setErr(""); }
    if (e.key === "Enter" && !(multiline && e.shiftKey)) { e.preventDefault(); save(); }
  };

  return (
    <div className={`pf${edit ? " editing" : ""}`}>
      <small>{label}</small>
      {edit ? (
        <>
          <div className="pf-edit">
            {multiline
              ? <textarea autoFocus rows={2} value={v} maxLength={max} onChange={(e) => setV(e.target.value)} onKeyDown={keys} placeholder={placeholder} />
              : <input autoFocus value={v} maxLength={max} onChange={(e) => setV(e.target.value)} onKeyDown={keys} placeholder={placeholder} />}
            <span className="cnt">{v.length}/{max}</span>
            <button className="icon-btn" onClick={save} disabled={busy || (!multiline && !v.trim())} aria-label="Simpan"><Icon n="check" size={18} /></button>
          </div>
          {err && <p className="error">{err}</p>}
        </>
      ) : (
        <button className="pf-view" onClick={() => setEdit(true)} aria-label={`Ubah ${label}`}>
          <span className={value ? "" : "ph"}>{value || placeholder}</span>
          {ok ? <svg className="draw" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> : <Icon n="edit" size={16} />}
        </button>
      )}
      {note && !edit && <em>{note}</em>}
    </div>
  );
}

// Ganti password: butuh password lama (kecuali baru saja verifikasi email/Google).
function PasswordCard({ onToast }: { onToast: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = pw.length >= 8 && pw === pw2 && !!cur;

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/me/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: cur, password: pw }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Gagal menyimpan"); setBusy(false); return; }
      setCur(""); setPw(""); setPw2(""); setOpen(false); onToast("Password diperbarui");
    } catch { setErr("Jaringan bermasalah, coba lagi"); }
    setBusy(false);
  }

  return (
    <div className="pf">
      <button className="pf-view" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span><Icon n="key" size={16} /> Ganti password</span><Icon n="down" size={16} />
      </button>
      {open && (
        <form className="pw-form" onSubmit={save}>
          <input type="password" placeholder="Password lama" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" maxLength={128} />
          <input type="password" placeholder="Password baru (min. 8 karakter)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" maxLength={128} />
          <input type="password" placeholder="Ulangi password baru" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" maxLength={128} />
          {pw2 && pw !== pw2 && <p className="error">Password tidak sama</p>}
          {err && <p className="error">{err}</p>}
          <button className="primary" disabled={busy || !ok}>{busy ? "Menyimpan…" : "Simpan password"}</button>
          <em>Lupa password lama? Keluar, lalu pilih “Lupa password” di halaman masuk.</em>
        </form>
      )}
    </div>
  );
}

export default function Profile({ me, onClose, onUpdate, onLogout, onToast, onConsole }: {
  me: Me; onClose: () => void; onUpdate: (p: Partial<Me>) => void; onLogout: () => void; onToast: (t: string) => void; onConsole?: () => void;
}) {
  const [theme, setTheme] = useTheme();
  const [sound, setSound] = usePref("sound", true);
  const [enter, setEnter] = usePref("enter", true);
  const [motion, setMotion] = usePref("motion", true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function patch(p: { name?: string; bio?: string }) {
    try {
      const r = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return (d.error as string) || "Gagal menyimpan";
      onUpdate({ name: d.name, bio: d.bio });
      return null;
    } catch { return "Jaringan bermasalah, coba lagi"; }
  }

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { onToast("Pilih file gambar"); return; }
    setBusy(true);
    try {
      const blob = await toSquare(f);
      setPreview(URL.createObjectURL(blob));
      const r = await fetch("/api/me/avatar", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Gagal mengunggah foto");
      onUpdate({ avatarUrl: d.avatar_url });
      onToast("Foto profil diperbarui");
    } catch (er: any) {
      setPreview(null);
      onToast(er?.message || "Gagal mengunggah foto");
    }
    setBusy(false);
  }

  async function removePhoto() {
    setBusy(true);
    try {
      const r = await fetch("/api/me/avatar", { method: "DELETE" });
      if (!r.ok) throw new Error();
      setPreview(null); onUpdate({ avatarUrl: null }); onToast("Foto profil dihapus");
    } catch { onToast("Gagal menghapus foto"); }
    setBusy(false);
  }

  const shown = preview ?? me.avatarUrl;
  async function copyUser() {
    try { await navigator.clipboard.writeText("@" + me.username); onToast("Username disalin"); } catch {}
  }

  return (
    <section className="profile" aria-label="Profil">
      <header>
        <button className="icon-btn" onClick={onClose} aria-label="Kembali"><Icon n="back" /></button>
        <strong>Profil</strong>
      </header>
      <div className="profile-body">
        <div className="p-avatar">
          <button className={`p-photo${busy ? " busy" : ""}`} onClick={() => file.current?.click()} disabled={busy} aria-label="Ganti foto profil">
            <Avatar name={me.name} src={shown} size={152} />
            <span className="p-over"><Icon n="camera" size={26} /><small>{busy ? "Memproses…" : "Ganti foto"}</small></span>
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={pickPhoto} />
          {shown && <button className="link danger" onClick={removePhoto} disabled={busy}>Hapus foto</button>}
        </div>

        <div className="card">
          <EditField label="Nama" value={me.name} placeholder="Nama tampilan" max={40} onSave={(v) => patch({ name: v })} />
          <EditField label="Info" value={me.bio ?? ""} placeholder="Tambahkan info tentang kamu" max={140} multiline onSave={(v) => patch({ bio: v })} />
          <div className="pf ro">
            <small>Username</small>
            <button className="pf-view" onClick={copyUser} aria-label="Salin username"><span>@{me.username}</span><Icon n="copy" size={16} /></button>
            <em>Username tidak bisa diganti.</em>
          </div>
          {me.email && <div className="pf ro"><small>Email</small><div className="pf-view static"><span>{me.email}</span></div></div>}
          {isStaffRole(me.role) && <div className="pf ro"><small>Role</small><div className="pf-view static"><span style={{ textTransform: "capitalize" }}>{me.role}<RoleBadge role={me.role} /></span></div></div>}
        </div>

        {onConsole && (
          <>
            <h4>Moderasi</h4>
            <div className="card">
              <button className="set set-btn" onClick={onConsole}><Icon n="shield" size={20} /><span>Buka Console<small>Kelola pengguna, grup, dan log moderasi</small></span><Icon n="back" size={18} /></button>
            </div>
          </>
        )}

        <h4>Keamanan</h4>
        <div className="card"><PasswordCard onToast={onToast} /></div>

        <h4>Pengaturan</h4>
        <div className="card">
          <div className="set">
            <Icon n={theme === "dark" ? "moon" : "sun"} size={20} /><span>Tema</span>
            <div className="seg2" role="group" aria-label="Tema">
              <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>Gelap</button>
              <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>Terang</button>
            </div>
          </div>
          <div className="set"><Icon n="bell" size={20} /><span>Suara pesan<small>Bunyi saat ada pesan baru</small></span><Switch on={sound} onChange={setSound} label="Suara pesan" /></div>
          <div className="set"><Icon n="keyboard" size={20} /><span>Enter untuk kirim<small>Di komputer. Shift+Enter = baris baru</small></span><Switch on={enter} onChange={setEnter} label="Enter untuk kirim" /></div>
          <div className="set"><Icon n="bolt" size={20} /><span>Animasi<small>Matikan agar lebih hemat di HP lama</small></span><Switch on={motion} onChange={setMotion} label="Animasi" /></div>
        </div>

        <button className="logout" onClick={onLogout}><Icon n="logout" size={20} />Keluar</button>
        <p className="ver">kevsoft-chat</p>
      </div>
    </section>
  );
}
