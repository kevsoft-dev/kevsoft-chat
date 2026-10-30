"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./ui";

type News = { id: string; title: string; body: string; at: number };
const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/* ---------- efek: muncul saat di-scroll + kata pada pil judul ---------- */
export function HomeFx() {
  useEffect(() => {
    const root = document.querySelector(".hm");
    if (!root) return;
    root.classList.add("hm-js");
    const els = Array.from(root.querySelectorAll<HTMLElement>(".hm-sec, .hm-card, .hm-quote, .hm-step, .hm-faq details"));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
    els.forEach((el) => { if (el.getBoundingClientRect().top > innerHeight) { el.classList.add("rv"); io.observe(el); } });
    return () => io.disconnect();
  }, []);
  return null;
}

const WORDS = ["Ngobrol", "Nanya AI", "Baca berita", "Kasih saran", "Bikin grup"];
export function PillWord() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((v) => (v + 1) % WORDS.length), 2200); return () => clearInterval(t); }, []);
  return <span key={i} className="hm-word">{WORDS[i]}</span>;
}

const TIPS = [
  "Tulis @kev-ai di grup, lalu pertanyaanmu. Jawabannya muncul di grup yang sama.",
  "Pesan sementara bisa dinyalakan per obrolan. Setelah waktunya habis, pesannya hilang sendiri.",
  "Link grup berisi kode acak. Kalau bocor, reset, kodenya diganti baru.",
  "Geser atau ketuk pesan untuk membalas. Balasan menampilkan kutipan di atas pesanmu.",
  "Komentar kritik & saran yang dinilai bagus oleh AI ditaruh paling atas.",
  "Tombol matahari/bulan di pojok atas mengganti tema terang dan gelap.",
  "Mau ambil berita ke aplikasimu sendiri? Cek halaman API, ada contoh request-nya.",
  "Username dipakai untuk mencari orang dan untuk tag @ di grup.",
];
export function Tips() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((v) => (v + 1) % TIPS.length), 4200); return () => clearInterval(t); }, []);
  return (
    <div className="hm-tips" aria-live="polite">
      <b>Tips {i + 1}/{TIPS.length}</b>
      <span key={i}>{TIPS[i]}</span>
      <button type="button" onClick={() => setI((v) => (v + 1) % TIPS.length)}>Lagi</button>
    </div>
  );
}

/* ---------- glosarium: tekan kartu untuk membalik ---------- */
const GLOSS = [
  ["@username", "Menyebut seseorang di grup. Namanya jadi tag biru dan orangnya dapat tanda."],
  ["@kev-ai", "Memanggil asisten AI di grup. Tulis setelahnya apa yang ingin kamu tanyakan."],
  ["Pesan sementara", "Pesan yang hilang sendiri setelah waktu tertentu. Cocok untuk hal yang tidak perlu disimpan."],
  ["Kode grup", "Link undangan berisi kode acak, bukan nama grup. Bisa direset kapan saja."],
  ["Rules grup", "Aturan yang ditulis admin dan bisa dilihat anggota lewat menu titik tiga di pojok kanan atas grup."],
  ["RM", "Balasan AI di Kritik & Saran: komentar dihapus karena tidak membantu."],
  ["ACC", "Balasan AI di Kritik & Saran: komentar diterima dan tampil di daftar."],
  ["LIKE", "Balasan AI di Kritik & Saran: komentar baik, ditaruh paling atas."],
] as const;
export function Glossary() {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  return (
    <div className="hm-gloss">
      {GLOSS.map(([k, d], i) => (
        <button type="button" key={k} className={`hm-flip t-${["blue", "peach", "sand", "rose", "mint", "lilac", "blue", "peach"][i]}${open[i] ? " on" : ""}`} onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))} aria-pressed={!!open[i]}>
          <span className="hm-flip-in">
            <span className="f">{k}<small>tekan</small></span>
            <span className="b">{d}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- isi tiap aplikasi ---------- */
type Msg = { id: number; who: "l" | "r"; name?: string; text: string; ai?: boolean; gone?: boolean };
const FRIEND = [["Rani", "Hahaha iya, aku juga baru sadar."], ["Dimas", "Nanti kukirim fotonya ya."], ["Rani", "Boleh, jam berapa?"], ["Dimas", "Mantap, aku ikut."], ["Rani", "Eh itu tadi lucu banget."]];
const AI_REPLY = [
  [/api|berita/i, "Berita bisa diambil lewat GET /api/v1/news. Mau kubuatkan contoh fetch-nya?"],
  [/ringkas|rangkum/i, "Tempel teksnya di sini, nanti kubuat tiga poin singkat."],
  [/ide|nama|judul/i, "Beberapa ide: Warung Kabar, Pojok Sore, Obrolan Teras. Mau yang lebih santai atau lebih formal?"],
] as const;

function ChatApp() {
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 1, who: "l", name: "Rani", text: "Ada yang tahu cara pakai API berita?" }, { id: 2, who: "l", name: "Dimas", text: "Ada di halaman docs, lengkap dengan contoh." }]);
  const [v, setV] = useState(""); const [eph, setEph] = useState(false); const [typing, setTyping] = useState(false);
  const box = useRef<HTMLDivElement>(null); const n = useRef(10); const T = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => T.current.forEach(clearTimeout), []);
  useEffect(() => { box.current?.scrollTo({ top: 9999, behavior: "smooth" }); }, [msgs, typing]);
  const later = (f: () => void, ms: number) => { T.current.push(setTimeout(f, ms)); };
  const add = (m: Omit<Msg, "id">, ephemeral = false) => {
    const id = n.current++;
    setMsgs((x) => [...x.slice(-30), { ...m, id }]);
    if (ephemeral) { later(() => setMsgs((x) => x.map((q) => (q.id === id ? { ...q, gone: true } : q))), 4500); later(() => setMsgs((x) => x.filter((q) => q.id !== id)), 5100); }
  };
  const send = (t = v) => {
    t = t.trim(); if (!t) return; setV(""); add({ who: "r", text: t }, eph); setTyping(true);
    const ai = /@kev-ai/i.test(t);
    later(() => {
      setTyping(false);
      if (ai) add({ who: "l", name: "Kev-Ai", ai: true, text: (AI_REPLY.find(([re]) => re.test(t)) ?? [0, "Aku bantu jawab ya. Ceritakan sedikit lebih detail supaya jawabanku pas."])[1] as string }, eph);
      else { const [name, text] = rnd(FRIEND as unknown as string[][]); add({ who: "l", name, text }, eph); }
    }, ai ? 1300 : 900);
  };
  return (
    <>
      <div className="hm-chat" ref={box}>
        {msgs.map((m) => <div key={m.id} className={`hm-b ${m.who}${m.ai ? " ai" : ""}${m.gone ? " gone" : ""}`}>{m.name && <b>{m.name}</b>}{m.text}</div>)}
        {typing && <div className="hm-b l typ"><i /><i /><i /></div>}
      </div>
      <div className="hm-chips">
        <button type="button" onClick={() => setV("@kev-ai ide nama untuk grup kita")}>@kev-ai ide nama</button>
        <button type="button" onClick={() => setV("@kev-ai rangkum obrolan ini")}>@kev-ai rangkum</button>
        <button type="button" className={eph ? "on" : ""} onClick={() => setEph((x) => !x)}><Icon n="clock" size={13} /> Pesan sementara: {eph ? "nyala" : "mati"}</button>
      </div>
      <div className="hm-in-row"><input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Tulis pesan…" maxLength={120} /><button type="button" className="hm-send" onClick={() => send()} aria-label="Kirim"><Icon n="send" size={17} /></button></div>
    </>
  );
}

const QA = [
  ["Cara kerja pesan sementara?", "Kamu pilih durasinya di pengaturan obrolan. Begitu waktunya lewat, pesan baru yang masuk setelah itu ikut terhapus otomatis dari kedua sisi."],
  ["Bedanya DM dan grup?", "DM hanya untuk dua orang. Grup bisa banyak anggota, punya rules, kode undangan, dan bisa memanggil @kev-ai."],
  ["Kalau link grup bocor?", "Buka info grup, reset link. Kode lama langsung tidak berlaku dan kode acak yang baru dibuat."],
  ["Tulis balasan sopan untuk menolak ajakan", "Terima kasih sudah mengajak. Sayangnya kali ini aku belum bisa ikut. Kabari lagi kalau ada acara berikutnya ya."],
];
function AiApp() {
  const [q, setQ] = useState(-1); const [out, setOut] = useState(""); const t = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => () => clearInterval(t.current), []);
  const ask = (i: number) => {
    clearInterval(t.current); setQ(i); setOut(""); const full = QA[i][1]; let k = 0;
    t.current = setInterval(() => { k += 2; setOut(full.slice(0, k)); if (k >= full.length) clearInterval(t.current); }, 22);
  };
  return (
    <div className="hm-ai">
      <p className="hm-note">Contoh tampilan. Jawaban asli ada di grup, setelah kamu masuk.</p>
      {QA.map(([s], i) => <button type="button" key={s} className={`hm-q${q === i ? " on" : ""}`} onClick={() => ask(i)}>{s}</button>)}
      {q >= 0 && <div className="hm-b l ai"><b>Kev-Ai</b>{out}<span className="hm-caret" /></div>}
    </div>
  );
}

function NewsApp({ news }: { news: News[] }) {
  const [o, setO] = useState(""); const [liked, setL] = useState<Record<string, boolean>>({});
  if (!news.length) return <p className="hm-note">Belum ada berita yang bisa ditampilkan. Coba buka halaman Berita.</p>;
  return (
    <div className="hm-nws">
      {news.map((n) => (
        <div key={n.id} className={`hm-ni${o === n.id ? " on" : ""}`}>
          <button type="button" onClick={() => setO(o === n.id ? "" : n.id)}><b>{n.title}</b><Icon n="down" size={16} /></button>
          <div className="hm-ni-b"><div>
            <p>{n.body || "Buka halaman berita untuk membaca selengkapnya."}</p>
            <div className="hm-row"><button type="button" className={liked[n.id] ? "on" : ""} onClick={() => setL((l) => ({ ...l, [n.id]: !l[n.id] }))}><Icon n="heart" size={14} /> {liked[n.id] ? "Disukai" : "Suka"}</button><a href={`/news?id=${encodeURIComponent(n.id)}`}>Baca lengkap →</a></div>
          </div></div>
        </div>
      ))}
    </div>
  );
}

const STEPS = ["Terkirim", "Masa peninjauan", "AI memilah", "Selesai"];
function CasApp() {
  const [v, setV] = useState(""); const [s, setS] = useState(-1); const [res, setRes] = useState(""); const T = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => T.current.forEach(clearTimeout), []);
  const go = () => {
    const t = v.trim(); if (t.length < 4) return; setS(0); setRes("");
    [1, 2, 3].forEach((k) => T.current.push(setTimeout(() => setS(k), k * 900)));
    T.current.push(setTimeout(() => setRes(/jelek|sampah|buruk|payah/i.test(t) && !/saran|usul|sebaiknya|tolong|tambah/i.test(t) ? "RM" : /bagus|keren|suka|mantap|terima kasih|rapi/i.test(t) ? "LIKE" : "ACC"), 3000));
  };
  return (
    <div className="hm-cas-app">
      <p className="hm-note">Simulasi alur. Kritik asli ditulis di halaman Kritik &amp; Saran.</p>
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={3} maxLength={160} placeholder="Contoh: tampilannya rapi, tapi tolong tambah mode hemat kuota." disabled={s >= 0 && s < 3} />
      <ol className="hm-steps-m">{STEPS.map((x, i) => <li key={x} className={s >= i ? "on" : ""}><i />{x}</li>)}</ol>
      {res && <div className={`hm-verdict ${res}`}><b>{res}</b><span>{res === "RM" ? "Dihapus karena tidak membantu." : res === "LIKE" ? "Komentar baik, naik ke paling atas." : "Diterima dan masuk daftar."}</span></div>}
      <div className="hm-row"><button type="button" className="hm-mini" onClick={go} disabled={s >= 0 && s < 3}>Kirim</button><button type="button" className="hm-mini ghost" onClick={() => { setS(-1); setRes(""); setV(""); }}>Ulang</button></div>
    </div>
  );
}

const EP = ["/api/v1", "/api/v1/news?limit=2", "/api/v1/cas"];
function ApiApp() {
  const [e, setE] = useState(1); const [out, setOut] = useState(""); const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setOut("");
    try { const r = await fetch(EP[e]); const t = await r.text(); let p = t; try { p = JSON.stringify(JSON.parse(t), null, 2); } catch {} setOut(`HTTP ${r.status}\n${p.slice(0, 700)}${p.length > 700 ? "\n…" : ""}`); }
    catch { setOut("Gagal terhubung. Coba lagi sebentar."); }
    setBusy(false);
  };
  return (
    <div className="hm-api">
      <div className="hm-tabs">{EP.map((x, i) => <button type="button" key={x} className={e === i ? "on" : ""} onClick={() => { setE(i); setOut(""); }}>GET {x.replace("/api/v1", "") || "/"}</button>)}</div>
      <code className="hm-url">GET {EP[e]}</code>
      <button type="button" className="hm-mini" onClick={run} disabled={busy}>{busy ? "Memanggil…" : "Coba panggil"}</button>
      <pre className="hm-out">{out || "Tekan “Coba panggil”. Ini permintaan sungguhan ke API read-only."}</pre>
      <a href="/docs" className="hm-link">Baca dokumentasi lengkap →</a>
    </div>
  );
}

/* ---------- dock + jendela ---------- */
const APPS: { id: string; icon: IconName; name: string; sub: string; tone: string; x: number; y: number }[] = [
  { id: "chat", icon: "chat", name: "Chat", sub: "kirim pesan", tone: "blue", x: 12, y: 12 },
  { id: "ai", icon: "sparkle", name: "Kev-Ai", sub: "tanya apa saja", tone: "peach", x: 372, y: 36 },
  { id: "news", icon: "news", name: "Berita", sub: "kabar terbaru", tone: "sand", x: 710, y: 10 },
  { id: "cas", icon: "heart", name: "Kritik & Saran", sub: "alur peninjauan", tone: "rose", x: 150, y: 330 },
  { id: "api", icon: "key", name: "API", sub: "coba langsung", tone: "mint", x: 540, y: 340 },
];

export function HomeApps({ news }: { news: News[] }) {
  const [wins, setWins] = useState<{ id: string; z: number; closing?: boolean; dx: number; dy: number }[]>([]);
  const z = useRef(10); const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const open = (id: string) => setWins((w) => (w.find((x) => x.id === id && !x.closing) ? w.map((x) => (x.id === id ? { ...x, z: ++z.current } : x)) : [...w.filter((x) => x.id !== id), { id, z: ++z.current, dx: 0, dy: 0 }]));
  const close = (id: string) => { setWins((w) => w.map((x) => (x.id === id ? { ...x, closing: true } : x))); setTimeout(() => setWins((w) => w.filter((x) => x.id !== id || !x.closing)), 200); };
  const front = (id: string) => setWins((w) => w.map((x) => (x.id === id ? { ...x, z: ++z.current } : x)));
  const down = (e: React.PointerEvent, id: string) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const w = wins.find((x) => x.id === id)!; drag.current = { id, sx: e.clientX, sy: e.clientY, ox: w.dx, oy: w.dy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); front(id);
  };
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; setWins((w) => w.map((x) => (x.id === d.id ? { ...x, dx: d.ox + e.clientX - d.sx, dy: d.oy + e.clientY - d.sy } : x))); };
  const body = (id: string) => (id === "chat" ? <ChatApp /> : id === "ai" ? <AiApp /> : id === "news" ? <NewsApp news={news} /> : id === "cas" ? <CasApp /> : <ApiApp />);

  return (
    <div className="hm-desk">
      <div className="hm-dock" role="toolbar" aria-label="Aplikasi kevsoft">
        {APPS.map((a) => {
          const on = wins.some((w) => w.id === a.id && !w.closing);
          return (
            <button type="button" key={a.id} className={`hm-app t-${a.tone}${on ? " on" : ""}`} onClick={() => open(a.id)}>
              <span className="hm-app-i"><Icon n={a.icon} size={26} /></span>
              <b>{a.name}</b><small>{a.sub}</small>
            </button>
          );
        })}
      </div>
      <div className="hm-stage" onPointerMove={move} onPointerUp={() => (drag.current = null)}>
        {!wins.length && <div className="hm-empty"><span>↑</span><p>Panggung masih kosong. Tekan salah satu aplikasi di atas.</p><small>Jendela bisa digeser dan ditutup. Boleh buka lebih dari satu.</small></div>}
        {wins.map((w) => {
          const a = APPS.find((x) => x.id === w.id)!;
          return (
            <section key={w.id} className={`hm-win${w.closing ? " out" : ""}`} style={{ ["--x" as string]: `${a.x + w.dx}px`, ["--y" as string]: `${a.y + w.dy}px`, zIndex: w.z }} onPointerDown={() => front(w.id)}>
              <header onPointerDown={(e) => down(e, w.id)}>
                <button type="button" className="hm-x" onClick={() => close(w.id)} aria-label={`Tutup ${a.name}`}><Icon n="close" size={12} /></button>
                <span><Icon n={a.icon} size={14} /> {a.name}</span>
              </header>
              <div className="hm-win-b">{body(w.id)}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
