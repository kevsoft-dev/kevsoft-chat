import { getUserId } from "@/lib/auth";
import { db, ID_RE } from "@/lib/firebaseDb";
import { casPublic } from "@/lib/publicApi";
import { LOGO } from "@/lib/mentions";
import { Icon } from "@/components/ui";
import ThemeToggle from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "kevsoft · Beranda",
  description: "Chat, grup, asisten AI Kev-Ai, berita, kritik & saran, dan API publik kevsoft.",
};

async function latestNews() {
  try {
    const r = await db("GET", "news", undefined, { orderBy: '"$key"', limitToLast: "3" });
    return Object.entries((r.data ?? {}) as Record<string, any>)
      .filter(([id, n]) => ID_RE.test(id) && n && typeof n.title === "string")
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([id, n]) => ({ id, title: String(n.title).slice(0, 90), body: String(n.body ?? "").replace(/\s+/g, " ").slice(0, 120), at: Number(n.createdAt) || 0 }));
  } catch { return []; }
}

async function topFeedback() {
  try {
    const list = await casPublic("");
    return list.filter((c) => c.status === "like").sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 3);
  } catch { return []; }
}

const FEATURES = [
  { icon: "chat", title: "Chat & grup", text: "Ngobrol pribadi atau bareng grup, lengkap dengan balasan, tag @username, dan pesan sementara.", href: "/chat" },
  { icon: "sparkle", title: "Kev-Ai", text: "Asisten AI yang siap menjawab. Di grup, panggil dengan @kev-ai lalu tulis pertanyaanmu.", href: "/chat" },
  { icon: "news", title: "Berita Kevsoft", text: "Kabar terbaru dari tim. Bisa di-like, dibagikan, dan dikomentari.", href: "/news" },
  { icon: "heart", title: "Kritik & Saran", text: "Tulis masukanmu. AI meninjau, dan komentar yang bagus tampil paling atas.", href: "/cas" },
  { icon: "key", title: "API publik", text: "Ambil berita, komentar, dan kritik & saran lewat API read-only dengan dokumentasi lengkap.", href: "/docs" },
  { icon: "users", title: "Komunitas", text: "Satu ruang bersama untuk semua anggota kevsoft. Langsung masuk saat mendaftar.", href: "/chat" },
] as const;

const fmt = (ms: number) => (ms ? new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "");

export default async function HomeRoute() {
  let authed = false;
  try { authed = !!(await getUserId()); } catch {}
  const [news, feedback] = await Promise.all([latestNews(), topFeedback()]);
  const cta = authed ? { href: "/chat", label: "Buka chat" } : { href: "/sign-in?next=/chat", label: "Masuk" };

  return (
    <div className="hm">
      <header className="hm-nav">
        <a href="/home" className="hm-brand"><img src={LOGO} alt="" width={28} height={28} /><strong>kevsoft</strong></a>
        <nav className="hm-links" aria-label="Halaman">
          <a href="/chat">Chat</a><a href="/news">Berita</a><a href="/cas">Kritik &amp; Saran</a><a href="/docs">API</a>
        </nav>
        <div className="hm-nav-r">
          <ThemeToggle />
          <a className="hm-btn" href={cta.href}>{cta.label}</a>
        </div>
      </header>

      <main>
        <section className="hm-hero">
          <div className="hm-hero-text hm-in">
            <span className="hm-eyebrow">kevsoft · komunitas</span>
            <h1>Ngobrol, kabar terbaru, dan API. <span>Satu tempat.</span></h1>
            <p>Chat pribadi dan grup, asisten AI Kev-Ai, berita dari tim, dan API publik untuk kamu pakai sendiri.</p>
            <div className="hm-cta">
              <a className="hm-btn big" href={cta.href}>{cta.label} <Icon n="send" size={16} /></a>
              <a className="hm-btn ghost big" href="/cas">Tulis kritik &amp; saran</a>
            </div>
          </div>

          <div className="hm-preview hm-in" style={{ animationDelay: ".12s" }} aria-hidden>
            <div className="hm-pv-bar"><i /><i /><i /><span>Komunitas Kevsoft</span></div>
            <div className="hm-pv-body">
              <div className="hm-b l"><b>Rani</b>Ada yang tahu cara pakai API berita?</div>
              <div className="hm-b l"><b>Dimas</b>Ada kok di halaman docs, lengkap dengan contoh.</div>
              <div className="hm-b r">Mantap, langsung coba 👍</div>
              <div className="hm-b l ai"><b>Kev-Ai</b>Mau aku bantu tulis contoh requestnya?</div>
            </div>
          </div>
        </section>

        <section className="hm-sec hm-in" style={{ animationDelay: ".2s" }}>
          <h2>Semua yang kamu butuh</h2>
          <div className="hm-grid">
            {FEATURES.map((f) => (
              <a key={f.title} className="hm-card" href={f.href}>
                <span className="hm-ico"><Icon n={f.icon} size={20} /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </a>
            ))}
          </div>
        </section>

        {news.length > 0 && (
          <section className="hm-sec">
            <div className="hm-sec-h"><h2>Kabar terbaru</h2><a href="/news">Semua berita →</a></div>
            <div className="hm-news">
              {news.map((n) => (
                <a key={n.id} className="hm-card" href={`/news?id=${encodeURIComponent(n.id)}`}>
                  <small>{fmt(n.at)}</small>
                  <h3>{n.title}</h3>
                  {n.body && <p>{n.body}{n.body.length >= 120 ? "…" : ""}</p>}
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="hm-sec">
          <div className="hm-cas">
            <div className="hm-cas-t">
              <span className="hm-eyebrow">Kritik &amp; Saran</span>
              <h2>Suaramu membentuk kevsoft</h2>
              <p>Ada yang kurang atau punya ide? Tulis di sini. AI meninjau dalam hitungan detik, dan komentar terbaik tampil paling atas.</p>
              <a className="hm-btn big" href="/cas">Tulis kritik &amp; saran <Icon n="edit" size={16} /></a>
            </div>
            {feedback.length > 0 && (
              <div className="hm-cas-list">
                {feedback.map((c) => (
                  <a key={c.id} className="hm-quote" href="/cas">
                    <p>“{c.body.length > 140 ? c.body.slice(0, 140) + "…" : c.body}”</p>
                    <small>{c.user.name} · {c.type}</small>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="hm-foot">
        <span>© kevsoft</span>
        <nav aria-label="Tautan">
          <a href="/chat">Chat</a><a href="/news">Berita</a><a href="/cas">Kritik &amp; Saran</a><a href="/docs">Dokumentasi API</a>
        </nav>
      </footer>
    </div>
  );
}
