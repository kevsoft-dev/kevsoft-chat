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
    { id: "start", t: "Mulai" }, { id: "auth", t: "Autentikasi" },
    ...ENDPOINTS.map((e) => ({ id: e.id, t: e.title })),
    { id: "errors", t: "Kode error" }, { id: "kevai", t: "Kev-Ai" },
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

  const keyHeader = open ? "" : `-H "x-api-key: KUNCI_KAMU" `;

  return (
    <div className="dc">
      <header className="dc-top">
        <a href="/home" className="dc-brand"><span className="brand-mark">k</span><strong>kevsoft</strong><span className="muted">/ docs</span></a>
        <ThemeToggle />
      </header>

      <div className="dc-wrap">
        <nav className="dc-nav" aria-label="Isi dokumentasi">
          {nav.map((n) => <a key={n.id} href={`#${n.id}`} className={active === n.id ? "on" : ""}>{n.t}</a>)}
        </nav>

        <main className="dc-main">
          <section className="dc-sec" id="start">
            <span className="eyebrow">API v1</span>
            <h1>Dokumentasi API</h1>
            <p className="muted">API publik kevsoft bersifat <b>read-only</b> (hanya GET) dan mengembalikan JSON. Isinya: berita, komentar berita, dan komentar Kritik &amp; Saran yang lolos peninjauan.</p>
            <h4>Base URL</h4>
            <Code>{base + "/api/v1"}</Code>
            <h4>Permintaan pertama</h4>
            <Code>{`curl ${keyHeader}"${base}/api/v1/news?limit=5"`}</Code>
            <h4>Dari JavaScript</h4>
            <Code>{`const r = await fetch("${base}/api/v1/cas?sort=best&limit=10"${open ? "" : `, {\n  headers: { "x-api-key": "KUNCI_KAMU" },\n}`});
const { data } = await r.json();`}</Code>
            <ul className="dc-list">
              <li>CORS terbuka untuk GET, jadi bisa dipanggil dari browser.</li>
              <li>Respons tidak berisi id internal user atau email. Hanya username, nama, foto, dan centang.</li>
              <li>Waktu memakai format ISO 8601 (UTC).</li>
            </ul>
          </section>

          <section className="dc-sec" id="auth">
            <h2>Autentikasi dan batas</h2>
            {open ? (
              <p className="muted">API saat ini <b>terbuka</b>: tidak perlu key. Batas <b>120 permintaan/menit per IP</b>.</p>
            ) : (
              <p className="muted">API butuh <b>API key</b>. Kirim lewat header <code>x-api-key: KUNCI</code> atau <code>Authorization: Bearer KUNCI</code>. Batas <b>120 permintaan/menit per key</b>. Key diminta ke pemilik kevsoft.</p>
            )}
            {!open && (
              <>
                <label className="dc-label" htmlFor="dc-key">API key untuk “Coba langsung” (hanya disimpan di tab ini)</label>
                <input id="dc-key" className="dc-in" type="password" autoComplete="off" placeholder="Tempel API key" value={keyVal} onChange={(e) => saveKey(e.target.value)} />
              </>
            )}
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
