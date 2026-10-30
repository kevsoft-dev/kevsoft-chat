"use client";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ThemeToggle from "./ThemeToggle";
import { Icon } from "./ui";
import { DOC_PAGES } from "@/lib/docsContent";
import { ENDPOINTS, ERRORS, type Endpoint } from "@/lib/apiDocs";

const GROUPS = ["Mulai", "Sistem", "API", "Lainnya"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const FAKE = "https://domainmu.com";

/* ---------- inline: `kode`, **tebal**, *miring*, [teks](url) ---------- */
function inline(s: string, origin: string): ReactNode[] {
  s = s.replaceAll(FAKE, origin);
  return s.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g).map((p, i) => {
    if (p.startsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (m) return m[2].startsWith("/") ? <Link key={i} href={m[2]}>{m[1]}</Link> : <a key={i} href={m[2]} target="_blank" rel="noreferrer">{m[1]}</a>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

type Block =
  | { t: "h"; l: 2 | 3; text: string; id: string }
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "code"; lang: string; code: string }
  | { t: "note"; kind: string; text: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "eps"; group: string }
  | { t: "errors" };

function parse(body: string): Block[] {
  const L = body.split("\n"); const out: Block[] = []; let i = 0;
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const starts = (l: string) => /^(~~~|```|#{2,3} |> |\| |- |\d+\. |:::)/.test(l);
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    const f = l.match(/^(~~~|```)(.*)$/);
    if (f) { const code: string[] = []; i++; while (i < L.length && !L[i].startsWith(f[1])) code.push(L[i++]); i++; out.push({ t: "code", lang: f[2].trim(), code: code.join("\n") }); continue; }
    const h = l.match(/^(#{2,3}) (.*)$/);
    if (h) { out.push({ t: "h", l: h[1].length as 2 | 3, text: h[2], id: slug(h[2]) }); i++; continue; }
    const ep = l.match(/^:::endpoints (\w+)/);
    if (ep) { out.push({ t: "eps", group: ep[1] }); i++; continue; }
    if (l.startsWith(":::errors")) { out.push({ t: "errors" }); i++; continue; }
    if (l.startsWith("> ")) {
      const q: string[] = []; while (i < L.length && L[i].startsWith(">")) q.push(L[i++].replace(/^>\s?/, ""));
      const k = q[0].match(/^\[!(NOTE|WARNING|TIP)\]$/); out.push({ t: "note", kind: k ? k[1].toLowerCase() : "note", text: (k ? q.slice(1) : q).join(" ") }); continue;
    }
    if (l.startsWith("|")) {
      const rows: string[][] = []; while (i < L.length && L[i].startsWith("|")) rows.push(cells(L[i++]));
      out.push({ t: "table", head: rows[0], rows: rows.slice(2) }); continue;
    }
    const li = l.match(/^(- |\d+\. )/);
    if (li) {
      const ord = /^\d/.test(li[1]); const items: string[] = [];
      while (i < L.length && (ord ? /^\d+\. /.test(L[i]) : L[i].startsWith("- "))) items.push(L[i++].replace(/^(- |\d+\. )/, ""));
      out.push({ t: ord ? "ol" : "ul", items }); continue;
    }
    const p: string[] = []; while (i < L.length && L[i].trim() && !starts(L[i])) p.push(L[i++]);
    out.push({ t: "p", text: p.join(" ") });
  }
  return out;
}

function Code({ lang, code, origin }: { lang: string; code: string; origin: string }) {
  const [ok, setOk] = useState(false);
  const text = code.replaceAll(FAKE, origin);
  return (
    <figure className="gd-code">
      <figcaption><span>{lang || "teks"}</span><button type="button" onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? "Disalin" : "Salin"}</button></figcaption>
      <pre><code>{text}</code></pre>
    </figure>
  );
}

function Try({ e }: { e: Endpoint }) {
  const [key, setKey] = useState(""); const [id, setId] = useState(""); const [q, setQ] = useState(e.tryQuery ?? "");
  const [out, setOut] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { try { setKey(sessionStorage.getItem("kc_docs_key") ?? ""); } catch {} }, []);
  const run = async () => {
    setBusy(true); setOut("");
    try { sessionStorage.setItem("kc_docs_key", key); } catch {}
    try {
      const url = e.path.replace("{id}", encodeURIComponent(id)) + (q ? `?${q}` : "");
      const r = await fetch(url, { headers: key ? { "x-api-key": key } : {} });
      const t = await r.text(); let p = t; try { p = JSON.stringify(JSON.parse(t), null, 2); } catch {}
      setOut(`HTTP ${r.status}\n${p.slice(0, 2500)}${p.length > 2500 ? "\n…" : ""}`);
    } catch { setOut("Gagal terhubung."); }
    setBusy(false);
  };
  return (
    <div className="gd-try">
      <div className="gd-try-row">
        <input type="password" value={key} onChange={(x) => setKey(x.target.value)} placeholder="API key (kc_live_…)" aria-label="API key" autoComplete="off" />
        {e.path.includes("{id}") && <input value={id} onChange={(x) => setId(x.target.value)} placeholder="id" aria-label="id" />}
        <input value={q} onChange={(x) => setQ(x.target.value)} placeholder="query, mis. limit=5" aria-label="query" />
        <button type="button" onClick={run} disabled={busy}>{busy ? "…" : "Kirim"}</button>
      </div>
      {out && <pre>{out}</pre>}
    </div>
  );
}

function EndpointCard({ e, origin }: { e: Endpoint; origin: string }) {
  return (
    <section className="gd-ep" id={e.id}>
      <h3><span className="gd-m">{e.method}</span><code>{e.path}</code></h3>
      <p><strong>{e.title}.</strong> {e.desc}</p>
      {e.params && (
        <div className="gd-tbl"><table><thead><tr><th>Parameter</th><th>Tipe</th><th>Keterangan</th></tr></thead>
          <tbody>{e.params.map((p) => <tr key={p.name}><td><code>{p.name}</code>{p.required && <b className="gd-req"> wajib</b>}</td><td>{p.type}</td><td>{p.desc}</td></tr>)}</tbody></table></div>
      )}
      <Code lang="json" code={JSON.stringify(e.sample, null, 2)} origin={origin} />
      <details className="gd-tryw"><summary>Coba langsung</summary><Try e={e} /></details>
    </section>
  );
}

function Article({ body, origin }: { body: string; origin: string }) {
  const blocks = useMemo(() => parse(body), [body]);
  return (
    <div className="gd-md">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h": return b.l === 2 ? <h2 key={i} id={b.id}><a href={`#${b.id}`} aria-label="Tautan ke bagian ini">#</a>{inline(b.text, origin)}</h2> : <h3 key={i} id={b.id}>{inline(b.text, origin)}</h3>;
          case "p": return <p key={i}>{inline(b.text, origin)}</p>;
          case "ul": return <ul key={i}>{b.items.map((x, j) => <li key={j}>{inline(x, origin)}</li>)}</ul>;
          case "ol": return <ol key={i}>{b.items.map((x, j) => <li key={j}>{inline(x, origin)}</li>)}</ol>;
          case "code": return <Code key={i} lang={b.lang} code={b.code} origin={origin} />;
          case "note": return <aside key={i} className={`gd-note ${b.kind}`}><b>{b.kind === "warning" ? "Peringatan" : b.kind === "tip" ? "Tips" : "Catatan"}</b><p>{inline(b.text, origin)}</p></aside>;
          case "table": return <div className="gd-tbl" key={i}><table><thead><tr>{b.head.map((h, j) => <th key={j}>{inline(h, origin)}</th>)}</tr></thead><tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c, origin)}</td>)}</tr>)}</tbody></table></div>;
          case "eps": return <div key={i}>{ENDPOINTS.filter((e) => (b.group === "me" ? e.id === "me-get" || e.id === "index" : e.id.startsWith(b.group + "-"))).map((e) => <EndpointCard key={e.id} e={e} origin={origin} />)}</div>;
          case "errors": return <div className="gd-tbl" key={i}><table><thead><tr><th>Kode</th><th>Kapan muncul</th></tr></thead><tbody>{ERRORS.map((e) => <tr key={e.code}><td><code>{e.code}</code></td><td>{e.when}</td></tr>)}</tbody></table></div>;
        }
      })}
    </div>
  );
}

export default function Docs({ slug: current }: { slug: string }) {
  const page = DOC_PAGES.find((p) => p.id === current) ?? DOC_PAGES[0];
  const [origin, setOrigin] = useState(FAKE);
  const [navOpen, setNavOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => setOrigin(location.origin), []);
  useEffect(() => { setNavOpen(false); window.scrollTo({ top: 0 }); }, [page.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "/" && !/INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName)) { e.preventDefault(); search.current?.focus(); } if (e.key === "Escape") setQ(""); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  const toc = useMemo(() => parse(page.body).filter((b): b is Extract<Block, { t: "h" }> => b.t === "h"), [page]);
  useEffect(() => {
    const hs = Array.from(document.querySelectorAll<HTMLElement>(".gd-md h2[id], .gd-md h3[id]"));
    const io = new IntersectionObserver((es) => { const v = es.find((e) => e.isIntersecting); if (v) setActive(v.target.id); }, { rootMargin: "-80px 0px -70% 0px" });
    hs.forEach((h) => io.observe(h)); return () => io.disconnect();
  }, [page]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    return DOC_PAGES.map((p) => {
      if (!`${p.title}\n${p.desc}\n${p.body}`.toLowerCase().includes(t)) return null;
      const body = p.body.replace(/\s+/g, " "); const bi = body.toLowerCase().indexOf(t);
      return { p, snip: bi < 0 ? p.desc : (bi > 30 ? "…" : "") + body.slice(Math.max(0, bi - 30), bi + 70) + "…", score: p.title.toLowerCase().includes(t) ? 0 : 1 };
    }).filter(Boolean).sort((a, b) => a!.score - b!.score).slice(0, 8) as { p: (typeof DOC_PAGES)[number]; snip: string }[];
  }, [q]);

  const idx = DOC_PAGES.findIndex((p) => p.id === page.id);
  const prev = DOC_PAGES[idx - 1]; const next = DOC_PAGES[idx + 1];

  return (
    <div className="gd">
      <header className="gd-top">
        <button type="button" className="icon-btn gd-burger" onClick={() => setNavOpen((o) => !o)} aria-label="Menu dokumentasi" aria-expanded={navOpen}><Icon n="more" /></button>
        <Link href="/docs" className="gd-brand"><b>kevsoft</b><span>Docs</span></Link>
        <div className="gd-search">
          <Icon n="search" size={16} />
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari dokumentasi" aria-label="Cari dokumentasi" />
          <kbd>/</kbd>
          {q.trim().length >= 2 && (
            <div className="gd-results">
              {results.length ? results.map(({ p, snip }) => <Link key={p.id} href={`/docs/${p.id}`} onClick={() => setQ("")}><b>{p.title}</b><small>{p.group}</small><span>{snip}</span></Link>) : <p>Tidak ada hasil untuk “{q}”.</p>}
            </div>
          )}
        </div>
        <nav className="gd-links"><Link href="/settings/developer">Developer</Link><Link href="/chat">Aplikasi</Link><ThemeToggle /></nav>
      </header>

      <div className="gd-wrap">
        <aside className={`gd-side${navOpen ? " open" : ""}`}>
          {GROUPS.map((g) => (
            <div key={g} className="gd-grp">
              <h4>{g}</h4>
              {DOC_PAGES.filter((p) => p.group === g).map((p) => <Link key={p.id} href={`/docs/${p.id}`} className={p.id === page.id ? "on" : ""}>{p.title}</Link>)}
            </div>
          ))}
        </aside>

        <main className="gd-main">
          <nav className="gd-crumb" aria-label="Breadcrumb"><Link href="/docs">Docs</Link><span>/</span><span>{page.group}</span><span>/</span><b>{page.title}</b></nav>
          <h1>{page.title}</h1>
          {page.desc && <p className="gd-lead">{page.desc}</p>}
          <Article body={page.body} origin={origin} />
          <footer className="gd-foot">
            <div className="gd-pn">
              {prev ? <Link href={`/docs/${prev.id}`}><small>Sebelumnya</small><b>{prev.title}</b></Link> : <span />}
              {next ? <Link href={`/docs/${next.id}`} className="r"><small>Berikutnya</small><b>{next.title}</b></Link> : <span />}
            </div>
            <p>Menemukan kesalahan di halaman ini? Beri tahu lewat <Link href="/cas">Kritik &amp; Saran</Link>.</p>
          </footer>
        </main>

        <aside className="gd-toc" aria-label="Di halaman ini">
          {toc.length > 0 && <><h4>Di halaman ini</h4>{toc.map((h) => <a key={h.id} href={`#${h.id}`} className={`${h.l === 3 ? "sub " : ""}${active === h.id ? "on" : ""}`}>{h.text}</a>)}</>}
        </aside>
      </div>
    </div>
  );
}
