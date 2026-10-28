"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, Icon, Rich, RoleBadge, VerifiedBadge } from "./ui";

type Btn = { label: string; url: string };
type News = {
  id: string; title: string; body: string; buttons: Btn[]; images: string[]; videos: string[]; share_count: number;
  created_at: string; author: string; likes: number; liked: boolean; comments: number;
};
type Comment = {
  id: string; parent_id: string | null; body: string; mentions: string[]; created_at: string; user_id: string;
  username: string; name: string; avatar_url: string | null; role: string; verified: boolean;
};
type MeLite = { id: string; username: string; role: string };

const ago = (d: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 604800) return `${Math.floor(s / 86400)} hari lalu`;
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

function youtubeId(u: string): string | null {
  try {
    const x = new URL(u);
    if (x.hostname === "youtu.be") return x.pathname.slice(1, 12) || null;
    if (/(^|\.)youtube\.com$/.test(x.hostname)) {
      const v = x.searchParams.get("v") || /^\/(?:shorts|embed)\/([\w-]{11})/.exec(x.pathname)?.[1];
      return v && /^[\w-]{11}$/.test(v) ? v : null;
    }
  } catch {}
  return null;
}
const isDirectVideo = (u: string) => /\.(mp4|webm)(\?|#|$)/i.test(u);
const okHttps = (u: string) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

export default function NewsSlider({ me, onToast }: { me: MeLite; onToast: (t: string) => void }) {
  const [news, setNews] = useState<News[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);
  const [pause, setPause] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const deep = useRef(false);
  const isOwner = me.role === "owner";

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/news", { cache: "no-store" });
      if (r.ok) setNews((await r.json()).news);
      else setNews((n) => n ?? []);
    } catch { setNews((n) => n ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Tautan berbagi: /?news=<id> membuka berita itu langsung.
  useEffect(() => {
    if (!news || deep.current) return;
    const id = new URLSearchParams(window.location.search).get("news");
    deep.current = true;
    if (id && news.some((n) => n.id === id)) setOpenId(id);
  }, [news]);

  const go = useCallback((i: number) => {
    const el = track.current; if (!el || !news?.length) return;
    const n = (i + news.length) % news.length;
    setIdx(n);
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  }, [news]);

  useEffect(() => {
    if (!news || news.length < 2 || pause || openId || compose) return;
    const t = setInterval(() => go(idx + 1), 6000);
    return () => clearInterval(t);
  }, [news, idx, pause, openId, compose, go]);

  const onScroll = () => {
    const el = track.current; if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== idx) setIdx(i);
  };

  if (news === null) return <div className="nw"><div className="nw-card skel" style={{ height: 132 }} /></div>;
  if (news.length === 0 && !isOwner) return null;

  return (
    <div className="nw" onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)} onTouchStart={() => setPause(true)} onTouchEnd={() => setPause(false)}>
      <div className="nw-head">
        <span><Icon n="news" size={15} /> Berita Kevsoft</span>
        {isOwner && <button className="nw-add" onClick={() => setCompose(true)}><Icon n="plus" size={14} /> Tambah</button>}
      </div>
      {news.length === 0 ? (
        <p className="nw-empty muted">Belum ada berita. Tekan Tambah untuk membuat berita pertama.</p>
      ) : (
        <>
          <div className="nw-track" ref={track} onScroll={onScroll}>
            {news.map((n) => {
              const cover = n.images[0];
              const hasVid = n.videos.length > 0;
              return (
                <button key={n.id} className="nw-card" onClick={() => setOpenId(n.id)} aria-label={`Buka berita: ${n.title}`}>
                  {cover && <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                  <span className="nw-shade" />
                  {hasVid && <span className="nw-play"><Icon n="play" size={16} /></span>}
                  <span className="nw-text">
                    <b>{n.title}</b>
                    <small>{n.body ? n.body.slice(0, 70) : ago(n.created_at)}</small>
                    <em><Icon n="heart" size={12} /> {n.likes} <Icon n="chat" size={12} /> {n.comments}</em>
                  </span>
                </button>
              );
            })}
          </div>
          {news.length > 1 && (
            <div className="nw-dots">
              {news.map((n, i) => <button key={n.id} className={i === idx ? "on" : ""} onClick={() => go(i)} aria-label={`Berita ${i + 1}`} />)}
            </div>
          )}
        </>
      )}
      {openId && news.find((n) => n.id === openId) && (
        <Viewer
          item={news.find((n) => n.id === openId)!} me={me} isOwner={isOwner} onToast={onToast}
          onClose={() => { setOpenId(null); load(); }}
          onPatch={(p) => setNews((l) => (l ?? []).map((x) => (x.id === openId ? { ...x, ...p } : x)))}
          onDeleted={() => { setOpenId(null); setIdx(0); load(); onToast("Berita dihapus"); }}
        />
      )}
      {compose && <Compose onClose={() => setCompose(false)} onDone={() => { setCompose(false); load(); onToast("Berita diterbitkan"); }} onToast={onToast} />}
    </div>
  );
}

function Viewer({ item, me, isOwner, onToast, onClose, onPatch, onDeleted }: {
  item: News; me: MeLite; isOwner: boolean; onToast: (t: string) => void; onClose: () => void;
  onPatch: (p: Partial<News>) => void; onDeleted: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  const slides: { t: "img" | "vid" | "yt" | "url"; src: string }[] = [
    ...item.images.filter(okHttps).map((u) => ({ t: "img" as const, src: u })),
    ...item.videos.filter(okHttps).map((u) => {
      const y = youtubeId(u);
      return y ? { t: "yt" as const, src: `https://www.youtube-nocookie.com/embed/${y}` } : isDirectVideo(u) ? { t: "vid" as const, src: u } : { t: "url" as const, src: u };
    }),
  ];

  const loadComments = useCallback(async () => {
    try {
      const r = await fetch(`/api/news/comments?id=${item.id}`, { cache: "no-store" });
      if (r.ok) { const c = (await r.json()).comments as Comment[]; setComments(c); onPatch({ comments: c.length }); }
    } catch { setComments((c) => c ?? []); }
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadComments(); }, [loadComments]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function like() {
    onPatch({ liked: !item.liked, likes: item.likes + (item.liked ? -1 : 1) });
    try {
      const r = await fetch("/api/news/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      if (r.ok) { const d = await r.json(); onPatch({ liked: d.liked, likes: d.likes }); } else throw 0;
    } catch { onPatch({ liked: item.liked, likes: item.likes }); onToast("Gagal menyukai"); }
  }
  async function share() {
    const url = `${window.location.origin}/?news=${item.id}`;
    try {
      if (navigator.share) await navigator.share({ title: item.title, text: item.body.slice(0, 100), url });
      else { await navigator.clipboard.writeText(url); onToast("Link berita disalin"); }
      const r = await fetch("/api/news/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      const d = await r.json().catch(() => null);
      if (d?.counted) onPatch({ share_count: d.shares });
    } catch { /* dibatalkan pengguna */ }
  }
  async function send() {
    const body = text.trim(); if (!body || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/news/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newsId: item.id, body, parentId: replyTo?.id ?? null }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { onToast(d.error || "Komentar gagal dikirim"); return; }
      setText(""); setReplyTo(null); await loadComments();
    } catch { onToast("Jaringan bermasalah"); } finally { setBusy(false); }
  }
  async function delComment(c: Comment) {
    if (!confirm("Hapus komentar ini (beserta balasannya)?")) return;
    const r = await fetch(`/api/news/comments?news=${item.id}&id=${c.id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json().catch(() => ({})); onToast(d.error || "Gagal menghapus"); return; }
    loadComments();
  }
  async function delNews() {
    if (!confirm(`Hapus berita “${item.title}” beserta semua like dan komentarnya?`)) return;
    const r = await fetch(`/api/news?id=${item.id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json().catch(() => ({})); onToast(d.error || "Gagal menghapus berita"); return; }
    onDeleted();
  }
  function reply(c: Comment) {
    setReplyTo(c); setText((t) => (t.startsWith(`@${c.username} `) ? t : `@${c.username} ${t}`));
    setTimeout(() => box.current?.focus(), 0);
  }

  const tops = (comments ?? []).filter((c) => !c.parent_id);
  // Balasan bertingkat diratakan di bawah komentar induk teratasnya (gaya Telegram/IG).
  const byId = new Map((comments ?? []).map((c) => [c.id, c]));
  const rootOf = (c: Comment): string => { let x = c; for (let i = 0; i < 20 && x.parent_id && byId.get(x.parent_id); i++) x = byId.get(x.parent_id)!; return x.id; };
  const replies = (id: string) => (comments ?? []).filter((c) => c.parent_id && rootOf(c) === id);
  const canDel = (c: Comment) => c.user_id === me.id || (isOwner && c.role !== "owner");

  const Row = ({ c, sub }: { c: Comment; sub?: boolean }) => (
    <li className={`nw-c ${sub ? "sub" : ""}`}>
      <Avatar name={c.name || c.username} src={c.avatar_url} size={sub ? 26 : 32} />
      <div>
        <p><b>{c.name || c.username}</b> <RoleBadge role={c.role} labels={{ owner: "Owner", admin: "Admin", user: "Member" }} />{c.verified && <VerifiedBadge />} <small>{ago(c.created_at)}</small></p>
        <p className="nw-cb"><Rich body={c.body} mentions={c.mentions} me={me.username} /></p>
        <div className="nw-ca">
          <button onClick={() => reply(c)}>Balas</button>
          {canDel(c) && <button className="danger" onClick={() => delComment(c)}>Hapus</button>}
        </div>
      </div>
    </li>
  );

  return (
    <div className="nw-modal" role="dialog" aria-modal="true" aria-label={item.title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="nw-sheet">
        <header>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon n="close" /></button>
          <div><strong>Berita Kevsoft</strong><small>{item.author} · {ago(item.created_at)}</small></div>
          {isOwner && <button className="icon-btn danger" onClick={delNews} aria-label="Hapus berita"><Icon n="trash" /></button>}
        </header>
        <div className="nw-scroll">
          {slides.length > 0 && (
            <div className="nw-media">
              {slides[slide].t === "img" && <img src={slides[slide].src} alt={item.title} referrerPolicy="no-referrer" />}
              {slides[slide].t === "vid" && <video key={slides[slide].src} src={slides[slide].src} controls playsInline preload="metadata" referrerPolicy="no-referrer" />}
              {slides[slide].t === "yt" && <iframe src={slides[slide].src} title={item.title} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />}
              {slides[slide].t === "url" && <a className="nw-btn" href={slides[slide].src} target="_blank" rel="noopener noreferrer nofollow"><Icon n="play" size={16} /> Tonton video</a>}
              {slides.length > 1 && (
                <>
                  <button className="nw-nav l" onClick={() => setSlide((slide - 1 + slides.length) % slides.length)} aria-label="Sebelumnya"><Icon n="back" /></button>
                  <button className="nw-nav r" onClick={() => setSlide((slide + 1) % slides.length)} aria-label="Berikutnya" style={{ transform: "scaleX(-1)" }}><Icon n="back" /></button>
                  <span className="nw-count">{slide + 1}/{slides.length}</span>
                </>
              )}
            </div>
          )}
          <article>
            <h3>{item.title}</h3>
            {item.body && <p className="nw-body">{item.body}</p>}
            {item.buttons.length > 0 && (
              <div className="nw-btns">
                {item.buttons.filter((b) => okHttps(b.url)).map((b, i) => (
                  <a key={i} className="nw-btn" href={b.url} target="_blank" rel="noopener noreferrer nofollow"><Icon n="link" size={15} /> {b.label}</a>
                ))}
              </div>
            )}
            <div className="nw-act">
              <button className={item.liked ? "on" : ""} onClick={like} aria-pressed={item.liked}><Icon n="heart" size={18} /> {item.likes}</button>
              <button onClick={() => box.current?.focus()}><Icon n="chat" size={18} /> {item.comments}</button>
              <button onClick={share}><Icon n="share" size={18} /> {item.share_count}</button>
            </div>
          </article>
          <section className="nw-comments">
            <h4>Komentar</h4>
            {comments === null && <p className="muted small">Memuat…</p>}
            {comments?.length === 0 && <p className="muted small">Belum ada komentar. Jadilah yang pertama.</p>}
            <ul>
              {tops.map((c) => (
                <li key={c.id} className="nw-thread">
                  <ul><Row c={c} /></ul>
                  {replies(c.id).length > 0 && <ul className="nw-rep">{replies(c.id).map((r) => <Row key={r.id} c={r} sub />)}</ul>}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <footer>
          {replyTo && <div className="nw-replying">Membalas @{replyTo.username}<button onClick={() => { setReplyTo(null); setText((t) => t.replace(new RegExp(`^@${replyTo.username} `), "")); }} aria-label="Batal balas"><Icon n="close" size={14} /></button></div>}
          <div className="nw-input">
            <textarea ref={box} rows={1} maxLength={500} placeholder="Tulis komentar… (ketik @ untuk tag orang)" value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Komentar" />
            <button className="icon-btn send" onClick={send} disabled={busy || !text.trim()} aria-label="Kirim komentar"><Icon n="send" /></button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Compose({ onClose, onDone, onToast }: { onClose: () => void; onDone: () => void; onToast: (t: string) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([""]);
  const [videos, setVideos] = useState<string[]>([]);
  const [btns, setBtns] = useState<Btn[]>([]);
  const [busy, setBusy] = useState(false);
  const setAt = (list: string[], i: number, v: string) => list.map((x, j) => (j === i ? v : x));

  async function submit() {
    if (!title.trim()) { onToast("Judul wajib diisi"); return; }
    const imgs = images.map((u) => u.trim()).filter(Boolean);
    const vids = videos.map((u) => u.trim()).filter(Boolean);
    if ([...imgs, ...vids].some((u) => !okHttps(u))) { onToast("Semua URL gambar/video harus diawali https://"); return; }
    const goodBtns = btns.filter((b) => b.label.trim() || b.url.trim());
    if (goodBtns.some((b) => !b.label.trim() || !okHttps(b.url.trim()))) { onToast("Tombol butuh label dan link https://"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), images: imgs, videos: vids, buttons: goodBtns.map((b) => ({ label: b.label.trim(), url: b.url.trim() })) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { onToast(d.error || "Gagal menerbitkan"); return; }
      onDone();
    } catch { onToast("Jaringan bermasalah"); } finally { setBusy(false); }
  }

  return (
    <div className="nw-modal" role="dialog" aria-modal="true" aria-label="Tambah berita" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="nw-sheet">
        <header>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon n="close" /></button>
          <div><strong>Tambah berita</strong><small>Hanya owner</small></div>
        </header>
        <div className="nw-scroll nw-form">
          <label>Judul<input className="field" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul berita" /></label>
          <label>Isi berita<textarea className="field" rows={5} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Tulis kabar terbaru dari Kevsoft…" /></label>

          <div className="nw-btnedit">
            <span>URL gambar (maks 6)</span>
            {images.map((u, i) => (
              <div key={i} className="row one">
                {okHttps(u.trim()) ? <img className="nw-thumb" src={u.trim()} alt="" referrerPolicy="no-referrer" /> : <span className="nw-thumb" />}
                <input className="field" placeholder="https://…/gambar.jpg" inputMode="url" value={u} onChange={(e) => setImages(setAt(images, i, e.target.value))} />
                <button className="icon-btn" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="Hapus gambar"><Icon n="trash" size={16} /></button>
              </div>
            ))}
            {images.length < 6 && <button className="link" onClick={() => setImages([...images, ""])}><Icon n="plus" size={14} /> Tambah gambar</button>}
          </div>

          <div className="nw-btnedit">
            <span>URL video (maks 3: YouTube atau link .mp4 / .webm)</span>
            {videos.map((u, i) => (
              <div key={i} className="row one">
                <input className="field" placeholder="https://youtu.be/…" inputMode="url" value={u} onChange={(e) => setVideos(setAt(videos, i, e.target.value))} />
                <button className="icon-btn" onClick={() => setVideos(videos.filter((_, j) => j !== i))} aria-label="Hapus video"><Icon n="trash" size={16} /></button>
              </div>
            ))}
            {videos.length < 3 && <button className="link" onClick={() => setVideos([...videos, ""])}><Icon n="plus" size={14} /> Tambah video</button>}
          </div>

          <div className="nw-btnedit">
            <span>Tombol (maks 3)</span>
            {btns.map((b, i) => (
              <div key={i} className="row">
                <input className="field" maxLength={24} placeholder="Label" value={b.label} onChange={(e) => setBtns(btns.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input className="field" placeholder="https://…" inputMode="url" value={b.url} onChange={(e) => setBtns(btns.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                <button className="icon-btn" onClick={() => setBtns(btns.filter((_, j) => j !== i))} aria-label="Hapus tombol"><Icon n="trash" size={16} /></button>
              </div>
            ))}
            {btns.length < 3 && <button className="link" onClick={() => setBtns([...btns, { label: "", url: "" }])}><Icon n="plus" size={14} /> Tambah tombol</button>}
          </div>
        </div>
        <footer><button className="nw-publish" onClick={submit} disabled={busy}>{busy ? "Menerbitkan…" : "Terbitkan berita"}</button></footer>
      </div>
    </div>
  );
}
