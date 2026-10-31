"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Icon, VerifiedBadge } from "./ui";

type CType = "kritik" | "saran" | "lainnya";
type Item = {
  id: string; body: string; type: CType; status: "like" | "acc";
  created_at: string; reviewed_at: string | null; can_delete: boolean; mine: boolean;
  user: { id: string; username: string; name: string; avatar_url: string | null; role: string; verified: boolean };
};
type Pending = { id: string; body: string; type: CType; created_at: string; tries: number };
type Data = { comments: Item[]; pending: Pending[]; queue: number | null; fetchedAt: number };
type Me = { id: string; username: string; name: string; avatarUrl: string | null; verified: boolean; root: boolean };
type Verdict = "ACC" | "LIKE" | "RM";
type Track = { id: string | null; since: number; phase: "review" | "done"; verdict?: Verdict; stalled?: boolean };

const MIN = 10, MAX = 600, MAX_TRIES = 5;
const LABEL: Record<CType, string> = { kritik: "Kritik", saran: "Saran", lainnya: "Lainnya" };
const HINT: Record<CType, string> = {
  kritik: "Sampaikan apa yang kurang, sertakan alasannya.",
  saran: "Ceritakan ide atau perbaikan yang kamu inginkan.",
  lainnya: "Pertanyaan, apresiasi, atau hal lain.",
};

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "baru saja";
  if (s < 3600) return `${Math.round(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
const full = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });

export default function Cas({ me }: { me: Me }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<"all" | "like" | CType>("all");
  const [sort, setSort] = useState<"best" | "new">("best");
  const [type, setType] = useState<CType>("saran");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [track, setTrack] = useState<Track | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState("");
  const flashT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = (t: string) => { setFlash(t); clearTimeout(flashT.current); flashT.current = setTimeout(() => setFlash(""), 2600); };

  const load = useCallback(async () => {
    const startedAt = Date.now();
    try {
      const r = await fetch("/api/cas", { cache: "no-store" });
      if (r.status === 401) { window.location.assign("/sign-in?next=/cas"); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Gagal memuat"); return; }
      setErr(""); setData({ ...d, fetchedAt: startedAt });
    } catch { setErr("Jaringan bermasalah"); }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Pantau lebih rapat saat ada komentar yang sedang ditinjau; selain itu cukup pelan.
  useEffect(() => {
    const ms = track?.phase === "review" || (data?.pending.length ?? 0) > 0 ? 2500 : 30000;
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, ms);
    return () => clearInterval(t);
  }, [track?.phase, data?.pending.length, load]);

  // Baca hasil peninjauan dari data terbaru (hanya data yang diambil SETELAH kirim).
  useEffect(() => {
    if (!data || !track || track.phase !== "review" || !track.id || data.fetchedAt < track.since) return;
    const done = data.comments.find((c) => c.id === track.id);
    if (done) { setTrack({ ...track, phase: "done", verdict: done.status === "like" ? "LIKE" : "ACC" }); return; }
    const wait = data.pending.find((p) => p.id === track.id);
    if (!wait) { setTrack({ ...track, phase: "done", verdict: "RM" }); return; }
    const stalled = wait.tries >= MAX_TRIES;
    if (stalled !== !!track.stalled) setTrack({ ...track, stalled });
  }, [data, track]);
  useEffect(() => {
    if (track?.phase !== "done") return;
    const t = setTimeout(() => setTrack(null), 12000);
    return () => clearTimeout(t);
  }, [track?.phase]);

  async function submit() {
    if (busy || body.trim().length < MIN) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/cas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, type }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Gagal mengirim"); return; }
      setBody("");
      if (d.verdict === "RM") setTrack({ id: null, since: Date.now(), phase: "done", verdict: "RM" });
      else { setTrack({ id: d.id, since: Date.now(), phase: "review" }); load(); }
    } catch { setErr("Jaringan bermasalah"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setConfirmId(null);
    try {
      const r = await fetch(`/api/cas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { say(d.error || "Gagal menghapus"); return; }
      setData((x) => (x ? { ...x, comments: x.comments.filter((c) => c.id !== id), pending: x.pending.filter((p) => p.id !== id) } : x));
      say("Komentar dihapus");
    } catch { say("Jaringan bermasalah"); }
  }

  const counts = useMemo(() => {
    const c = data?.comments ?? [];
    return { all: c.length, like: c.filter((x) => x.status === "like").length, kritik: c.filter((x) => x.type === "kritik").length, saran: c.filter((x) => x.type === "saran").length, lainnya: c.filter((x) => x.type === "lainnya").length };
  }, [data]);

  const shown = useMemo(() => {
    const c = (data?.comments ?? []).filter((x) => filter === "all" || (filter === "like" ? x.status === "like" : x.type === filter));
    return sort === "new" ? [...c].sort((a, b) => (a.id < b.id ? 1 : -1)) : c;
  }, [data, filter, sort]);

  const len = body.trim().length;
  const ready = len >= MIN && !busy;
  const waiting = (data?.pending ?? []).filter((p) => p.id !== track?.id);

  return (
    <div className="cas">
      <div className="cas-wrap">
        <nav className="cas-nav">
          <a className="cas-back" href="/chat"><Icon n="back" size={16} /> Chat</a>
          {me.root && <span className="cas-owner" title="Kamu bisa menghapus komentar apa pun">Owner utama{data?.queue ? ` · ${data.queue} antre` : ""}</span>}
        </nav>

        <header className="cas-head">
          <p className="cas-eyebrow">Comment for kevsoft</p>
          <h1>Kritik &amp; Saran</h1>
          <p className="cas-sub">Criticism and suggestions. Sampaikan masukanmu secara bebas dan sopan. Setiap komentar ditinjau AI sebelum tampil.</p>
          <details className="cas-how">
            <summary>Cara kerja</summary>
            <ol>
              <li><b>Kirim</b><span>Tulis kritik atau sarannya.</span></li>
              <li><b>Peninjauan</b><span>AI membaca dan memberi satu penilaian.</span></li>
              <li><b>Dipilah</b><span><code>LIKE</code> tampil paling atas, <code>ACC</code> diterima, <code>RM</code> dihapus otomatis.</span></li>
            </ol>
            <p>Kritik kasar tanpa masukan akan dibuang. Kritik yang tetap memuat saran tetap diterima.</p>
          </details>
        </header>

        <section className="cas-compose" aria-label="Tulis komentar">
          <div className="cas-who">
            <Avatar name={me.name} src={me.avatarUrl} size={36} />
            <div><b>{me.name}{me.verified && <VerifiedBadge />}</b><span>@{me.username}</span></div>
          </div>
          <div className="cas-seg" role="tablist" aria-label="Jenis komentar">
            {(["saran", "kritik", "lainnya"] as CType[]).map((t) => (
              <button key={t} role="tab" aria-selected={type === t} className={type === t ? "on" : ""} onClick={() => setType(t)}>{LABEL[t]}</button>
            ))}
          </div>
          <textarea
            className="cas-input" rows={4} maxLength={MAX} value={body} placeholder={HINT[type]}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(); }}
            aria-label="Isi komentar"
          />
          <div className="cas-foot">
            <span className={`cas-count${len > 0 && len < MIN ? " warn" : ""}`}>{len}/{MAX}{len > 0 && len < MIN ? ` · minimal ${MIN}` : ""}</span>
            <span className="cas-kbd">Ctrl + Enter</span>
            <button className="primary" disabled={!ready} onClick={submit}>{busy ? "Mengirim…" : "Kirim"}</button>
          </div>
          {err && <p className="cas-err" role="alert">{err}</p>}
        </section>

        {track && <Pipeline t={track} onClose={() => setTrack(null)} />}

        {waiting.map((p) => (
          <div className="cas-wait" key={p.id}>
            <span className="cas-spin" aria-hidden />
            <div><b>Menunggu peninjauan</b><p>{p.body}</p></div>
            <time title={full(p.created_at)}>{ago(p.created_at)}</time>
            <button className="cas-x" aria-label="Batalkan" onClick={() => remove(p.id)}><Icon n="close" size={14} /></button>
          </div>
        ))}

        <div className="cas-bar">
          <div className="cas-chips" role="tablist" aria-label="Filter">
            {([["all", "Semua"], ["like", "Pilihan"], ["kritik", "Kritik"], ["saran", "Saran"], ["lainnya", "Lainnya"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
                {l}<em>{counts[k]}</em>
              </button>
            ))}
          </div>
          <button className="cas-sort" onClick={() => setSort(sort === "best" ? "new" : "best")} title="Ganti urutan">
            {sort === "best" ? "Terbaik dulu" : "Terbaru dulu"}
          </button>
        </div>

        <ul className="cas-list">
          {!data && !err && Array.from({ length: 3 }, (_, i) => <li key={i} className="cas-card skel-card"><span className="skel" /><i className="skel" /><i className="skel" /></li>)}
          {data && shown.length === 0 && (
            <li className="cas-empty">{filter === "all" ? "Belum ada komentar. Jadilah yang pertama memberi masukan." : "Tidak ada komentar di kategori ini."}</li>
          )}
          {shown.map((c, i) => {
            const long = c.body.length > 240, isOpen = open.has(c.id);
            return (
              <li key={c.id} className={`cas-card${c.status === "like" ? " pick" : ""}`} style={{ ["--i" as string]: Math.min(i, 8) }}>
                <div className="cas-card-top">
                  <Avatar name={c.user.name} src={c.user.avatar_url} size={36} />
                  <div className="cas-meta">
                    <b>{c.user.name}{(c.user.verified || c.user.role === "owner") && <VerifiedBadge />}{c.mine && <u>Kamu</u>}</b>
                    <span>@{c.user.username} · <time title={full(c.created_at)}>{ago(c.created_at)}</time></span>
                  </div>
                  <div className="cas-tags">
                    {c.status === "like" && <span className="cas-pick"><Icon n="heart" size={12} /> Pilihan</span>}
                    <span className={`cas-type ${c.type}`}>{LABEL[c.type]}</span>
                  </div>
                </div>
                <p className={`cas-body${long && !isOpen ? " clamp" : ""}`}>{c.body}</p>
                <div className="cas-card-foot">
                  {long && (
                    <button className="cas-more" onClick={() => setOpen((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}>
                      {isOpen ? "Ringkas" : "Selengkapnya"}
                    </button>
                  )}
                  <span className="cas-review" title={c.reviewed_at ? `Ditinjau AI ${full(c.reviewed_at)}` : undefined}>Ditinjau AI · {c.status === "like" ? "LIKE" : "ACC"}</span>
                  {c.can_delete && (confirmId === c.id ? (
                    <span className="cas-confirm">
                      <button className="cas-del danger" onClick={() => remove(c.id)}>Ya, hapus</button>
                      <button className="cas-more" onClick={() => setConfirmId(null)}>Batal</button>
                    </span>
                  ) : (
                    <button className="cas-del" onClick={() => setConfirmId(c.id)}><Icon n="trash" size={14} /> Hapus</button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="cas-end">kevsoft · kritik dan saran</p>
      </div>
      {flash && <div className="toast" role="status">{flash}</div>}
    </div>
  );
}

// Alur: Kirim > Masa peninjauan > Pilah. Hasil AI ditampilkan apa adanya (RM / ACC / LIKE).
function Pipeline({ t, onClose }: { t: Track; onClose: () => void }) {
  const done = t.phase === "done";
  const msg = !done
    ? t.stalled ? "Peninjauan tertunda. Akan dicoba lagi otomatis." : "AI sedang membaca komentarmu…"
    : t.verdict === "LIKE" ? "Dipilih sebagai komentar baik. Tampil di bagian paling atas."
    : t.verdict === "ACC" ? "Diterima. Komentarmu sudah tampil di daftar."
    : "Tidak lolos peninjauan dan dihapus otomatis. Kritik tanpa masukan yang berguna tidak ditampilkan.";
  return (
    <div className={`cas-track ${done ? "done" : "run"}${t.verdict ? " v-" + t.verdict.toLowerCase() : ""}`} role="status" aria-live="polite">
      <ol className="cas-steps">
        <li className="ok"><i><Icon n="check" size={11} /></i><span>Kirim</span></li>
        <li className={done ? "ok" : "now"}><i>{done ? <Icon n="check" size={11} /> : null}</i><span>Peninjauan</span></li>
        <li className={done ? "ok" : ""}><i>{done ? <Icon n="check" size={11} /> : null}</i><span>Pilah</span></li>
      </ol>
      <div className="cas-track-msg">
        {t.verdict && <code>{t.verdict}</code>}
        <p>{msg}</p>
        {done && <button className="cas-x" aria-label="Tutup" onClick={onClose}><Icon n="close" size={14} /></button>}
      </div>
    </div>
  );
}
