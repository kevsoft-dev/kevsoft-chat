"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar, Icon } from "./ui";
import { SECTIONS } from "@/lib/settingsNav";
import { useTheme } from "./ThemeToggle";
import { usePref } from "@/lib/prefs";

export type Me = { username: string; name: string; email: string; avatar: string | null; bio: string; role: string; awayOn: boolean; awayMsg: string };
const J = { "Content-Type": "application/json" };
const Sw = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`sw${on ? " on" : ""}`} onClick={() => onChange(!on)}><i /></button>
);
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 5 ? "Aktif sekarang" : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.floor(m / 60)} jam lalu` : `${Math.floor(m / 1440)} hari lalu`;
};
type Flash = (m: string) => void;

function Profil({ me }: { me: Me }) {
  return (
    <>
      <div className="card st-prof">
        <Avatar name={me.name} src={me.avatar} size={96} />
        <b>{me.name}</b><span>@{me.username}</span>
        <p>{me.bio || "Belum ada bio."}</p>
      </div>
      <a className="card st-entry" href="/chat?profile=1"><div className="set"><Icon n="edit" size={20} /><span>Ubah foto, sampul, nama, dan bio<small>Dibuka di panel profil aplikasi</small></span><Icon n="back" size={18} /></div></a>
      <p className="st-hint">Username dipakai orang lain untuk mencarimu dan men-tag kamu dengan @. Username tidak bisa diubah di sini.</p>
    </>
  );
}

function Akun({ me }: { me: Me }) {
  const out = async (all: boolean) => {
    if (all && !confirm("Keluar dari semua perangkat? Kamu harus login ulang di mana pun.")) return;
    await fetch(all ? "/api/me/sessions" : "/api/auth/logout", { method: all ? "DELETE" : "POST" });
    window.location.assign("/sign-in");
  };
  return (
    <>
      <div className="card">
        <div className="set"><Icon n="at" size={20} /><span>Username<small>@{me.username}</small></span></div>
        <div className="set"><Icon n="send" size={20} /><span>Email<small>{me.email || "Belum ada email"}</small></span></div>
        <div className="set"><Icon n="shield" size={20} /><span>Peran<small>{me.role === "owner" ? "Pemilik" : me.role === "user" ? "Pengguna" : me.role}</small></span></div>
      </div>
      <p className="st-hint">Ganti password lewat panel profil. Setelah password diganti, semua perangkat otomatis keluar.</p>
      <div className="card">
        <button type="button" className="set st-btn" onClick={() => out(false)}><Icon n="logout" size={20} /><span>Keluar<small>Hanya di perangkat ini</small></span></button>
        <button type="button" className="set st-btn danger" onClick={() => out(true)}><Icon n="alert" size={20} /><span>Keluar dari semua perangkat<small>Semua sesi dicabut, termasuk perangkat tertaut</small></span></button>
      </div>
    </>
  );
}

function Obrolan() {
  const [theme, setTheme] = useTheme();
  const [sound, setSound] = usePref("sound", true);
  const [enter, setEnter] = usePref("enter", true);
  const [motion, setMotion] = usePref("motion", true);
  return (
    <>
      <div className="card">
        <div className="set"><Icon n={theme === "dark" ? "moon" : "sun"} size={20} /><span>Tema<small>Terang atau gelap</small></span>
          <div className="seg2"><button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>Terang</button><button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>Gelap</button></div></div>
        <div className="set"><Icon n="bell" size={20} /><span>Suara pesan<small>Bunyi saat ada pesan baru</small></span><Sw on={sound} onChange={setSound} label="Suara pesan" /></div>
        <div className="set"><Icon n="keyboard" size={20} /><span>Enter untuk kirim<small>Di komputer. Shift+Enter = baris baru</small></span><Sw on={enter} onChange={setEnter} label="Enter untuk kirim" /></div>
        <div className="set"><Icon n="bolt" size={20} /><span>Animasi<small>Matikan agar lebih hemat di HP lama</small></span><Sw on={motion} onChange={setMotion} label="Animasi" /></div>
      </div>
      <p className="st-hint">Pilihan ini disimpan di perangkat ini saja, jadi tiap perangkat bisa berbeda.</p>
    </>
  );
}

function Otomatis({ me, flash }: { me: Me; flash: Flash }) {
  const [on, setOn] = useState(me.awayOn);
  const [msg, setMsg] = useState(me.awayMsg);
  const [busy, setBusy] = useState(false);
  const save = async (next = on) => {
    setBusy(true);
    const r = await fetch("/api/me", { method: "PATCH", headers: J, body: JSON.stringify({ away_enabled: next, away_message: msg }) });
    setBusy(false);
    flash(r.ok ? "Pesan otomatis disimpan" : "Gagal menyimpan");
  };
  return (
    <>
      <div className="card">
        <div className="set"><Icon n="clock" size={20} /><span>Kirim pesan otomatis<small>Dibalas ke yang chat pribadi saat kamu tidak di tempat</small></span><Sw on={on} onChange={(v) => { setOn(v); save(v); }} label="Pesan otomatis" /></div>
        <div className="away-box">
          <textarea className="away-input" rows={4} maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Tulis pesan otomatis…" />
          <div className="away-actions"><span className="cnt">{msg.length}/500</span><button className="primary st-save" disabled={busy} onClick={() => save()}>{busy ? "Menyimpan…" : "Simpan"}</button></div>
        </div>
      </div>
    </>
  );
}

type Dev = { id: string; label: string; platform: string | null; ip: string | null; linked: boolean; current: boolean; created_at: string; last_seen: string };
function Perangkat({ flash }: { flash: Flash }) {
  const [list, setList] = useState<Dev[] | null>(null);
  const [max, setMax] = useState(4);
  const [code, setCode] = useState("");
  const [found, setFound] = useState<{ label: string; platform: string; ip: string; expires_in: number } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/devices", { cache: "no-store" });
    if (r.ok) { const d = await r.json(); setList(d.devices); setMax(d.max_linked); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (approve: boolean) => {
    setBusy(true); setErr("");
    const r = await fetch("/api/devices/link", { method: "POST", headers: J, body: JSON.stringify({ code, approve }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error || "Gagal."); return; }
    if (approve) { flash("Perangkat berhasil ditautkan"); setFound(null); setCode(""); load(); } else setFound(d);
  };
  const revoke = async (d: Dev) => {
    if (!confirm(`Keluarkan ${d.label}?`)) return;
    const r = await fetch(`/api/devices/${d.id}`, { method: "DELETE" });
    if (!r.ok) return flash("Gagal mengeluarkan perangkat");
    if ((await r.json()).self) window.location.assign("/sign-in"); else { flash("Perangkat dikeluarkan"); load(); }
  };
  const cur = list?.find((d) => d.current);
  const others = list?.filter((d) => !d.current) ?? [];
  const row = (d: Dev) => (
    <div className="set" key={d.id}>
      <Icon n={d.platform === "Android" || d.platform === "iOS" ? "camera" : "keyboard"} size={20} />
      <span>{d.label}{d.linked ? " · tertaut" : ""}<small>{ago(d.last_seen)}{d.ip ? ` · IP ${d.ip}` : ""}</small></span>
      {!d.current && <button className="link" onClick={() => revoke(d)}>Keluarkan</button>}
    </div>
  );
  return (
    <>
      <div className="card st-hero">
        <Icon n="link" size={34} />
        <b>Gunakan kevsoft-chat di perangkat lain</b>
        <p>Di perangkat baru, buka halaman masuk lalu pilih <em>Tautkan dengan perangkat lain</em>. Kode 8 karakter akan muncul di layarnya. Masukkan kode itu di bawah.</p>
      </div>
      <div className="card st-form">
        <label htmlFor="lk">Kode tautan</label>
        <input id="lk" className="field st-code" value={code} placeholder="ABCD-EFGH" maxLength={9} autoComplete="off" autoCapitalize="characters"
          onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "")); setFound(null); setErr(""); }} />
        {err && <p className="error">{err}</p>}
        {found ? (
          <div className="st-confirm">
            <b>{found.label}</b>
            <small>IP {found.ip} · berlaku {Math.max(0, Math.floor(found.expires_in / 60))} menit lagi</small>
            <p>Setujui hanya kalau kamu sendiri yang sedang membuka halaman masuk di perangkat itu. Jangan setujui kode dari orang lain.</p>
            <div className="split"><button className="ghost" onClick={() => setFound(null)}>Batal</button><button className="primary" disabled={busy} onClick={() => call(true)}>{busy ? "Menautkan…" : "Setujui dan tautkan"}</button></div>
          </div>
        ) : <button className="primary" disabled={busy || code.replace("-", "").length !== 8} onClick={() => call(false)}>{busy ? "Mencari…" : "Cari perangkat"}</button>}
      </div>
      <h3 className="st-h">Perangkat ini</h3>
      <div className="card">{cur ? row(cur) : <div className="set"><Icon n="info" size={20} /><span>Sesi lama<small>Login ini dibuat sebelum fitur perangkat ada. Masuk ulang agar tercatat di sini.</small></span></div>}</div>
      <h3 className="st-h">Perangkat lain ({others.length})</h3>
      <div className="card">{list === null ? <div className="set"><span>Memuat…</span></div> : others.length ? others.map(row) : <div className="set"><span>Belum ada perangkat lain<small>Maksimal {max} perangkat tertaut.</small></span></div>}</div>
    </>
  );
}

type KeyRow = { id: string; name: string; prefix: string; created_at: string; last_used: string | null };
function Developer({ flash }: { flash: Flash }) {
  const [s, setS] = useState<{ enabled: boolean; since: string | null; keys: KeyRow[]; max_keys: number } | null>(null);
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await fetch("/api/developer", { cache: "no-store" }); if (r.ok) setS(await r.json()); }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (url: string, method: string, body?: unknown) => {
    setBusy(true); setErr("");
    const r = await fetch(url, { method, headers: J, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error || "Gagal."); return null; }
    return d;
  };
  if (!s) return <div className="card"><div className="set"><span>Memuat…</span></div></div>;
  if (!s.enabled) return (
    <>
      <div className="card st-hero">
        <Icon n="bolt" size={34} />
        <b>Developer mode</b>
        <p>API kevsoft hanya bisa dipakai lewat key yang kamu buat sendiri, dan key hanya bisa dibuat setelah bergabung ke developer mode.</p>
      </div>
      <div className="card st-terms">
        <ul>
          <li>API bersifat <b>read-only</b>: membaca berita, komentar, dan kritik &amp; saran yang sudah lolos peninjauan.</li>
          <li>Tiap key dibatasi <b>300 permintaan per menit</b>, maksimal 5 key aktif.</li>
          <li>Key itu rahasia. Jangan ditaruh di kode yang bisa dilihat publik atau di-commit ke GitHub.</li>
          <li>Penyalahgunaan (scraping berlebihan, mencoba menembus batas) bisa membuat akunmu diblokir.</li>
          <li>Keluar dari developer mode langsung mencabut semua key.</li>
        </ul>
        <label className="st-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Saya paham dan setuju dengan ketentuan di atas.</label>
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={!agree || busy} onClick={async () => { const d = await act("/api/developer", "POST", { accept: true }); if (d) { setS(d); flash("Developer mode aktif"); } }}>{busy ? "Memproses…" : "Gabung developer mode"}</button>
      </div>
    </>
  );
  const origin = typeof location !== "undefined" ? location.origin : "";
  return (
    <>
      <div className="card"><div className="set"><Icon n="check" size={20} /><span>Developer mode aktif<small>Sejak {s.since ? new Date(s.since).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-"}</small></span><a className="link" href="/docs/autentikasi">Dokumentasi</a></div></div>
      {fresh && (
        <div className="card st-fresh">
          <b>Key “{fresh.name}” dibuat</b>
          <p>Salin sekarang. Setelah halaman ini ditutup, key lengkap tidak bisa dilihat lagi.</p>
          <code>{fresh.key}</code>
          <div className="split"><button className="ghost" onClick={() => { navigator.clipboard?.writeText(fresh.key); flash("Key disalin"); }}>Salin key</button><button className="ghost" onClick={() => setFresh(null)}>Sudah saya simpan</button></div>
          <pre className="st-pre">{`curl -H "x-api-key: ${fresh.key}" ${origin}/api/v1/me`}</pre>
        </div>
      )}
      <h3 className="st-h">API key ({s.keys.length}/{s.max_keys})</h3>
      <div className="card">
        {s.keys.length ? s.keys.map((k) => (
          <div className="set" key={k.id}><Icon n="key" size={20} /><span>{k.name}<small>{k.prefix}… · dibuat {new Date(k.created_at).toLocaleDateString("id-ID")} · {k.last_used ? `dipakai ${ago(k.last_used)}` : "belum pernah dipakai"}</small></span>
            <button className="link" onClick={async () => { if (confirm(`Cabut key “${k.name}”? Aplikasi yang memakainya langsung berhenti.`) && (await act(`/api/developer/keys/${k.id}`, "DELETE"))) { flash("Key dicabut"); load(); } }}>Cabut</button></div>
        )) : <div className="set"><span>Belum ada key<small>Buat satu di bawah.</small></span></div>}
      </div>
      <div className="card st-form">
        <label htmlFor="kn">Nama key baru</label>
        <input id="kn" className="field" value={name} maxLength={40} placeholder="Contoh: bot berita Discord" onChange={(e) => setName(e.target.value)} />
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy || !name.trim() || s.keys.length >= s.max_keys} onClick={async () => { const d = await act("/api/developer/keys", "POST", { name }); if (d) { setFresh({ key: d.key, name: d.name }); setName(""); load(); } }}>{busy ? "Membuat…" : "Buat key"}</button>
      </div>
      <button type="button" className="logout" onClick={async () => { if (confirm("Keluar dari developer mode? Semua key dicabut.")) { const d = await act("/api/developer", "DELETE"); if (d) { setS(d); setFresh(null); flash("Developer mode dimatikan"); } } }}><Icon n="alert" size={20} />Keluar dari developer mode</button>
    </>
  );
}

const FAQ: [string, string][] = [
  ["Bagaimana menautkan perangkat?", "Di perangkat baru, buka halaman masuk lalu pilih “Tautkan dengan perangkat lain”. Masukkan kode 8 karakter yang muncul ke Pengaturan > Perangkat tertaut di perangkat yang sudah login, lalu setujui. Kode berlaku 3 menit."],
  ["Berapa perangkat yang bisa ditautkan?", "Maksimal 4 perangkat tertaut per akun. Perangkat yang login biasa dengan password, OTP, atau Google tidak ikut hitungan itu."],
  ["Perangkat tidak dikenal muncul di daftar?", "Keluarkan perangkat itu dari Perangkat tertaut. Kalau kamu curiga password bocor, pakai “Keluar dari semua perangkat” di Akun lalu ganti password."],
  ["Kenapa API key saya tidak jalan?", "Pastikan developer mode masih aktif dan key belum dicabut. Kirim key lewat header x-api-key. Kalau muncul 429, kamu melewati 300 permintaan per menit."],
  ["Apakah pesan terenkripsi end-to-end?", "Belum. Pesan disimpan di server agar bisa muncul di semua perangkat dan bisa dicari. Koneksi tetap dilindungi HTTPS."],
  ["Pesan sementara hilang di mana?", "Di semua perangkat, karena pesan dihapus dari server saat waktunya habis."],
];
function Bantuan() {
  return (
    <>
      <div className="st-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}<Icon n="down" size={18} /></summary><p>{a}</p></details>)}</div>
      <div className="card"><a className="set" href="/docs"><Icon n="file" size={20} /><span>Dokumentasi lengkap<small>Panduan, arsitektur, dan referensi API</small></span></a><a className="set" href="/cas"><Icon n="heart" size={20} /><span>Kritik &amp; Saran<small>Kirim masukan untuk kevsoft</small></span></a></div>
    </>
  );
}

function Tentang() {
  return (
    <>
      <div className="card st-hero"><Icon n="sparkle" size={34} /><b>kevsoft-chat</b><p>Aplikasi chat dengan DM, grup, komunitas, asisten Kev-Ai, berita, dan API publik.</p></div>
      <div className="card">
        <a className="set" href="/docs/arsitektur"><Icon n="share" size={20} /><span>Arsitektur sistem<small>Cara pesan, sesi, dan perangkat bekerja</small></span></a>
        <a className="set" href="/docs/keamanan"><Icon n="shield" size={20} /><span>Keamanan<small>Sesi, kata sandi, dan batas permintaan</small></span></a>
        <a className="set" href="/docs/changelog"><Icon n="news" size={20} /><span>Catatan perubahan<small>Apa yang baru</small></span></a>
        <a className="set" href="/home"><Icon n="users" size={20} /><span>Beranda<small>Tur singkat kevsoft</small></span></a>
      </div>
    </>
  );
}

export default function Settings({ section, me }: { section: string; me: Me }) {
  const [toast, setToast] = useState("");
  const flash: Flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };
  const cur = SECTIONS.find((s) => s.id === section);
  return (
    <div className={`st${cur ? " has-sec" : ""}`}>
      <aside className="st-nav">
        <div className="st-top"><Link className="icon-btn" href="/chat" aria-label="Kembali ke chat"><Icon n="back" /></Link><strong>Pengaturan</strong></div>
        <Link href="/settings/profil" className="st-me"><Avatar name={me.name} src={me.avatar} size={56} /><span><b>{me.name}</b><small>@{me.username}</small></span></Link>
        <nav>{SECTIONS.map((s) => (
          <Link key={s.id} href={`/settings/${s.id}`} className={`st-item${s.id === section ? " on" : ""}`}><Icon n={s.i} size={22} /><span><b>{s.t}</b><small>{s.d}</small></span></Link>
        ))}</nav>
      </aside>
      <main className="st-main">
        {cur ? (
          <>
            <div className="st-head"><Link className="icon-btn st-back-m" href="/settings" aria-label="Kembali"><Icon n="back" /></Link><h1>{cur.t}</h1></div>
            <div className="st-body" key={cur.id}>
              {cur.id === "profil" && <Profil me={me} />}
              {cur.id === "akun" && <Akun me={me} />}
              {cur.id === "obrolan" && <Obrolan />}
              {cur.id === "otomatis" && <Otomatis me={me} flash={flash} />}
              {cur.id === "perangkat" && <Perangkat flash={flash} />}
              {cur.id === "developer" && <Developer flash={flash} />}
              {cur.id === "bantuan" && <Bantuan />}
              {cur.id === "tentang" && <Tentang />}
            </div>
          </>
        ) : <div className="st-empty"><Icon n="chat" size={44} /><b>Pengaturan</b><p>Pilih salah satu di sebelah kiri.</p></div>}
      </main>
      {toast && <div className="st-toast" role="status">{toast}</div>}
    </div>
  );
}
