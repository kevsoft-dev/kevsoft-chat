"use client";
import { useEffect, useMemo, useState } from "react";
import { ENDPOINTS, ERRORS, type Endpoint } from "@/lib/apiDocs";
import ThemeToggle from "./ThemeToggle";

const json = (v: unknown) => JSON.stringify(v, null, 2);

function Copy({ text, label = "Salin" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="dc-copy" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1400); }).catch(() => {}); }}>
      {ok ? "Tersalin" : label}
    </button>
  );
}

function Code({ children, copy }: { children: string; copy?: boolean }) {
  return (
    <div className="dc-code">
      {copy !== false && <Copy text={children} />}
      <pre><code>{children}</code></pre>
    </div>
  );
}

function Try({ ep, base, keyVal, open }: { ep: Endpoint; base: string; keyVal: string; open: boolean }) {
  const hasId = ep.path.includes("{id}");
  const [id, setId] = useState("");
  const [qs, setQs] = useState(ep.tryQuery ?? "");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ status: number; ms: number; body: string } | null>(null);

  const url = ep.path.replace("{id}", encodeURIComponent(id || "ID")) + (qs.trim() ? `?${qs.trim().replace(/^\?/, "")}` : "");
  const curl = `curl ${open || !keyVal ? "" : `-H "x-api-key: ${keyVal}" `}"${base}${url}"`.replace("curl  ", "curl ");

  async function run() {
    if (hasId && !id.trim()) { setRes({ status: 0, ms: 0, body: "Isi ID dulu." }); return; }
    setBusy(true); setRes(null);
    const t = performance.now();
    try {
      const r = await fetch(url, { headers: keyVal ? { "x-api-key": keyVal } : {}, cache: "no-store" });
      const text = await r.text();
      let body = text; try { body = json(JSON.parse(text)); } catch {}
      setRes({ status: r.status, ms: Math.round(performance.now() - t), body: body.length > 6000 ? body.slice(0, 6000) + "\n…" : body });
    } catch { setRes({ status: 0, ms: 0, body: "Jaringan bermasalah." }); }
    setBusy(false);
  }

  return (
    <div className="dc-try">
      <h4>Coba langsung</h4>
      <div className="dc-row">
        {hasId && <input className="dc-in" placeholder="ID" value={id} onChange={(e) => setId(e.target.value)} aria-label="ID" />}
        <input className="dc-in grow" placeholder="query, mis. limit=5" value={qs} onChange={(e) => setQs(e.target.value)} aria-label="Query string" />
        <button className="dc-run" onClick={run} disabled={busy}>{busy ? "Memuat…" : "Kirim"}</button>
      </div>
      <Code>{curl}</Code>
      {res && (
        <div className="dc-res">
          <div className={`dc-stat ${res.status >= 200 && res.status < 300 ? "ok" : "bad"}`}>
            {res.status ? `HTTP ${res.status} · ${res.ms} ms` : "Gagal"}
          </div>
          <Code copy={false}>{res.body}</Code>
        </div>
      )}
    </div>
  );
}

function Section({ ep, base, keyVal, open }: { ep: Endpoint; base: string; keyVal: string; open: boolean }) {
  return (
    <section className="dc-sec" id={ep.id}>
      <div className="dc-head">
        <span className="dc-method">{ep.method}</span>
        <code className="dc-path">{ep.path}</code>
      </div>
      <h3>{ep.title}</h3>
      <p className="muted">{ep.desc}</p>
      {ep.params && (
        <div className="dc-table" role="table">
          {ep.params.map((p) => (
            <div className="dc-tr" role="row" key={p.name}>
              <code>{p.name}</code>
              <span className="dc-type">{p.type}{p.required ? " · wajib" : ""}</span>
              <span>{p.desc}</span>
            </div>
          ))}
        </div>
      )}
      <h4>Contoh respons</h4>
      <Code>{json(ep.sample)}</Code>
      <Try ep={ep} base={base} keyVal={keyVal} open={open} />
    </section>
  );
}

export default function Docs({ open }: { open: boolean }) {
  const [base, setBase] = useState("https://domainmu.com");
  const [keyVal, setKeyVal] = useState("");
  const [active, setActive] = useState("start");
  useEffect(() => {
    setBase(location.origin);
    try { setKeyVal(sessionStorage.getItem("kc_docs_key") ?? ""); } catch {}
  }, []);
  const saveKey = (v: string) => { setKeyVal(v); try { sessionStorage.setItem("kc_docs_key", v); } catch {} };

  const nav = useMemo(() => [
    { id: "start", t: "Mulai" },
    { id: "architecture", t: "Arsitektur sistem" },
    { id: "auth", t: "Autentikasi" },
    { id: "developer", t: "Mode Developer" },
    { id: "devices", t: "Perangkat tertaut" },
    ...ENDPOINTS.map((e) => ({ id: e.id, t: e.title })),
    { id: "errors", t: "Kode error" },
    { id: "kevai", t: "Kev-Ai" },
  ], []);

  useEffect(() => {
    const els = nav.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => {
      const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (v) setActive(v.target.id);
    }, { rootMargin: "-10% 0px -75% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [nav]);

  return (
    <div className="dc">
      <header className="dc-top">
        <a className="dc-brand" href="/">
          <strong>kevsoft</strong>
          <span className="muted"> / docs</span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/chat" className="muted" style={{ fontSize: 13, textDecoration: "none" }}>Buka chat</a>
          <ThemeToggle />
        </div>
      </header>

      <div className="dc-wrap">
        <nav className="dc-nav" aria-label="Navigasi dokumentasi">
          {nav.map((n) => (
            <a key={n.id} href={`#${n.id}`} className={active === n.id ? "on" : ""} onClick={() => setActive(n.id)}>
              {n.t}
            </a>
          ))}
        </nav>

        <main className="dc-main">
          <section className="dc-sec" id="start">
            <p className="eyebrow">API Reference</p>
            <h1 style={{ fontSize: 28, marginBottom: 8 }}>Dokumentasi API kevsoft</h1>
            <p className="muted" style={{ fontSize: 16, lineHeight: 1.6, maxWidth: 640 }}>
              API publik read-only untuk berita, komentar, dan Kritik &amp; Saran.
              Dirancang untuk integrasi pihak ketiga, bot, dan dashboard internal.
              Semua endpoint memakai JSON, CORS terbuka, dan tidak pernah membocorkan data sensitif pengguna.
            </p>
            <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 10 }}>
              <div className="dc-table" style={{ flex: "1 1 200px", margin: 0 }}>
                <div className="dc-tr two"><code>Domain</code><span><code>{base}</code> <span className="muted">(otomatis)</span></span></div>
                <div className="dc-tr two"><code>Base API</code><span><code>{base}/api/v1</code></span></div>
                <div className="dc-tr two"><code>Versi</code><span>v1</span></div>
                <div className="dc-tr two"><code>Format</code><span>JSON · UTF-8</span></div>
                <div className="dc-tr two"><code>News limit</code><span>180 req / menit / IP</span></div>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 14 }}>
              Domain terdeteksi otomatis dari URL yang sedang dibuka. Server juga membaca
              header <code>Host</code> / <code>X-Forwarded-Host</code> agar avatar &amp; link absolut
              selalu mengarah ke domain yang benar (termasuk di belakang proxy/CDN).
            </p>
            <h4 style={{ marginTop: 28 }}>Base URL</h4>
            <Code>{base}/api/v1</Code>
            <label className="dc-label" htmlFor="dc-base" style={{ marginTop: 16, display: "block" }}>Override base (opsional, untuk uji)</label>
            <input id="dc-base" className="dc-in grow" style={{ maxWidth: 420 }} value={base} onChange={(e) => setBase(e.target.value.replace(/\/+$/, ""))} />
          </section>

          <section className="dc-sec" id="architecture">
            <h2>Arsitektur &amp; strategi sistem</h2>
            <p className="muted">
              kevsoft-chat dibangun sebagai platform chat multi-perangkat yang meniru pola keamanan dan sesi WhatsApp,
              bukan sekadar demo UI. Setiap keputusan teknis diarahkan agar sistem terasa matang, dapat diaudit, dan siap produksi.
            </p>
            <ul className="dc-list">
              <li><b>Sesi bertanda tangan</b> — JWT httpOnly dengan versi token. Logout dari semua perangkat menaikkan <code>token_version</code> sehingga semua cookie lama langsung invalid.</li>
              <li><b>Perangkat tertaut</b> — Setiap login dicatat di tabel <code>linked_devices</code> (nama perangkat, tipe, IP, last active). Pengguna dapat mencabut perangkat tertentu dari Profil.</li>
              <li><b>Realtime</b> — Pusher private channel; otorisasi server memastikan user hanya subscribe percakapan yang diikutinya.</li>
              <li><b>Database</b> — Neon (Postgres) untuk chat &amp; pengguna; Firebase Realtime Database terpisah khusus berita &amp; CAS, diakses hanya dari server.</li>
              <li><b>API publik</b> — Read-only, rate-limited, key-based. Key master di config atau key pribadi yang dibuat setelah mengaktifkan Mode Developer.</li>
              <li><b>Keamanan input</b> — Zod di setiap route, query parameterized, pesan dirender sebagai teks (anti-XSS), OTP di-hash HMAC + constant-time compare.</li>
            </ul>
            <p className="muted" style={{ marginTop: 16 }}>
              Model ini sengaja dipilih agar perilaku sistem dapat diprediksi: satu akun, banyak perangkat, kontrol penuh dari sisi pengguna, dan API yang tidak bisa disalahgunakan tanpa key.
            </p>
          </section>

          <section className="dc-sec" id="auth">
            <h2>Autentikasi API</h2>
            <p className="muted">
              <b>Berita &amp; komentar berita</b> selalu <b>publik 100%</b> — tanpa API key.
              Rate limit: <b>180 permintaan/menit per IP</b>.
            </p>
            <p className="muted">
              Endpoint <b>Kritik &amp; Saran (/cas)</b>
              {open
                ? <> juga terbuka tanpa key (batas 120/menit per IP).</>
                : <> membutuhkan <b>API key</b> (header <code>x-api-key</code> atau <code>Authorization: Bearer</code>). Batas 120/menit per key. Aktifkan Mode Developer di Profil untuk membuat key.</>}
            </p>
            {!open && (
              <>
                <label className="dc-label" htmlFor="dc-key">API key untuk “Coba langsung” (hanya untuk CAS; disimpan di tab ini)</label>
                <input id="dc-key" className="dc-in" type="password" autoComplete="off" placeholder="Tempel API key (kc_…)" value={keyVal} onChange={(e) => saveKey(e.target.value)} style={{ maxWidth: 420 }} />
              </>
            )}
            <h4 style={{ marginTop: 20 }}>Contoh — semua berita + komentar (tanpa key)</h4>
            <Code>{`curl "${base}/api/v1/news?all=1"`}</Code>
            <Code>{`const r = await fetch("${base}/api/v1/news?all=1");
const { data } = await r.json();
// data[] = setiap berita + field comments (lengkap)`}</Code>
            <h4 style={{ marginTop: 16 }}>Contoh — CAS{open ? "" : " (butuh key)"}</h4>
            <Code>{`curl ${open ? "" : '-H "x-api-key: KUNCI_KAMU" '}"${base}/api/v1/cas?sort=best&limit=10"`}</Code>
            <ul className="dc-list">
              <li>CORS terbuka untuk GET, bisa dipanggil dari browser.</li>
              <li>Respons tidak berisi id internal user atau email. Hanya username, nama, foto, dan status verified.</li>
              <li>Waktu memakai format ISO 8601 (UTC).</li>
              <li><code>all=1</code> pada <code>/api/v1/news</code> mengembalikan seluruh berita beserta komentarnya dalam satu response.</li>
            </ul>
          </section>

          <section className="dc-sec" id="developer">
            <h2>Mode Developer &amp; API Account</h2>
            <p className="muted">
              Untuk mendapatkan API key pribadi, aktifkan <b>Mode Developer</b> di Profil akun kamu.
              Fitur ini sengaja dipisahkan agar hanya pengguna yang sadar risiko yang membuat key.
            </p>
            <ol className="dc-list" style={{ listStyle: "decimal" }}>
              <li>Buka chat → ikon profil → aktifkan <b>Mode Developer</b>.</li>
              <li>Di bagian yang muncul, buat API key baru (maks. 5 key aktif).</li>
              <li>Key ditampilkan <b>sekali saja</b> dalam bentuk <code>kc_…</code>. Simpan di tempat aman.</li>
              <li>Gunakan key tersebut di header <code>x-api-key</code> untuk semua endpoint /api/v1.</li>
              <li>Cabut key kapan saja dari Profil jika bocor atau tidak dipakai lagi.</li>
            </ol>
            <p className="muted" style={{ marginTop: 12 }}>
              Key master (dari <code>config.json</code>) tetap berfungsi untuk admin. Key user hanya valid selama Mode Developer aktif dan key belum dicabut.
            </p>
          </section>

          <section className="dc-sec" id="devices">
            <h2>Perangkat tertaut</h2>
            <p className="muted">
              Seperti WhatsApp Linked Devices, setiap sesi login dicatat sebagai perangkat.
              Kamu bisa melihat daftar perangkat aktif, waktu terakhir aktif, dan mencabut akses dari perangkat lain.
            </p>
            <ul className="dc-list">
              <li><b>Lihat daftar</b> — Profil → Perangkat tertaut, atau lewat menu akun.</li>
              <li><b>Cabut satu perangkat</b> — Hapus sesi perangkat tersebut tanpa mempengaruhi yang lain.</li>
              <li><b>Keluar dari semua perangkat</b> — Menaikkan versi token; semua cookie lama langsung tidak berlaku, termasuk yang dicuri.</li>
            </ul>
            <p className="muted" style={{ marginTop: 12 }}>
              Endpoint internal: <code>GET /api/me/sessions</code>, <code>PATCH /api/me/sessions</code> (cabut), <code>DELETE /api/me/sessions</code> (semua).
              Endpoint ini membutuhkan sesi login, bukan API key publik.
            </p>
          </section>

          {ENDPOINTS.map((ep) => <Section key={ep.id} ep={ep} base={base} keyVal={keyVal} open={open} />)}

          <section className="dc-sec" id="errors">
            <h2>Kode error</h2>
            <p className="muted">Error selalu berbentuk <code>{`{ "error": "pesan" }`}</code>.</p>
            <div className="dc-table">
              {ERRORS.map((e) => <div className="dc-tr two" key={e.code}><code>{e.code}</code><span>{e.when}</span></div>)}
            </div>
          </section>

          <section className="dc-sec" id="kevai">
            <h2>Kev-Ai</h2>
            <p className="muted">Asisten AI yang dipakai chat <b>@kev-ai</b> dan peninjau Kritik &amp; Saran. Layanannya terpisah dari API di atas.</p>
            <div className="dc-head"><span className="dc-method">GET</span><code className="dc-path">https://kev-ai.vercel.app/ai?text=</code></div>
            <Code>{`curl "https://kev-ai.vercel.app/ai?text=apa%20itu%20Next.js"`}</Code>
            <p className="muted">Isi <code>text</code> dengan pertanyaan (URL-encoded). Balasan berupa JSON atau teks biasa.</p>
          </section>
        </main>
      </div>
    </div>
  );
}
