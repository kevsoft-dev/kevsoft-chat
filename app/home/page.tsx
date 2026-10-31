import { getUserId } from "@/lib/auth";
import { db, ID_RE } from "@/lib/firebaseDb";
import { casPublic } from "@/lib/publicApi";
import { LOGO } from "@/lib/mentions";
import { Icon } from "@/components/ui";
import ThemeToggle from "@/components/ThemeToggle";
import { HomeFx, PillWord, Tips, Glossary, HomeApps } from "@/components/HomeLive";

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
  { icon: "chat", tone: "blue", title: "Chat & grup", text: "Ngobrol pribadi atau bareng grup, lengkap dengan balasan, tag @username, dan pesan sementara.", href: "/chat" },
  { icon: "sparkle", tone: "peach", title: "Kev-Ai", text: "Asisten AI yang siap menjawab. Di grup, panggil dengan @kev-ai lalu tulis pertanyaanmu.", href: "/chat" },
  { icon: "news", tone: "sand", title: "Berita Kevsoft", text: "Kabar terbaru dari tim. Bisa di-like, dibagikan, dan dikomentari.", href: "/news" },
  { icon: "heart", tone: "rose", title: "Kritik & Saran", text: "Tulis masukanmu. AI meninjau, dan komentar yang bagus tampil paling atas.", href: "/cas" },
  { icon: "key", tone: "mint", title: "API publik", text: "Ambil berita, komentar, dan kritik & saran lewat API read-only dengan dokumentasi lengkap.", href: "/docs" },
  { icon: "users", tone: "lilac", title: "Komunitas", text: "Satu ruang bersama untuk semua anggota kevsoft. Langsung masuk saat mendaftar.", href: "/chat" },
] as const;

const MARQUEE = ["Chat pribadi", "Grup", "Kev-Ai", "Berita", "Kritik & Saran", "API publik", "Pesan sementara", "Tag @username"];

const fmt = (ms: number) => (ms ? new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "");

export default async function HomeRoute() {
  let authed = false;
  try { authed = !!(await getUserId()); } catch {}
  const [news, feedback] = await Promise.all([latestNews(), topFeedback()]);
  const cta = authed ? { href: "/chat", label: "Buka chat" } : { href: "/sign-in?next=/chat", label: "Masuk" };
  const ctaFree = authed ? { href: "/chat", label: "Buka chat" } : { href: "/sign-in?next=/chat", label: "Mulai gratis" };

  return (
    <div className="hm">
      <HomeFx />
      <header className="hm-nav">
        <a href="/home" className="hm-brand"><img src={LOGO} alt="" width={30} height={30} /><strong>kevsoft</strong></a>
        <nav className="hm-links" aria-label="Halaman">
          <a href="/chat">Chat</a><a href="/news">Berita</a><a href="/cas">Kritik &amp; Saran</a><a href="/docs">API</a>
        </nav>
        <div className="hm-nav-r">
          <ThemeToggle className="hm-icon" />
          <a className="hm-btn" href={cta.href}>{cta.label}</a>
          <details className="hm-menu">
            <summary aria-label="Menu"><i /><i /><i /></summary>
            <nav className="hm-menu-p" aria-label="Menu seluler">
              <a href="/chat">Chat</a><a href="/news">Berita</a><a href="/cas">Kritik &amp; Saran</a><a href="/docs">API</a>
            </nav>
          </details>
        </div>
      </header>

      <div className="hm-banner" aria-hidden>
        <img src="/home/banner.webp" alt="" width={736} height={1075} fetchPriority="high" decoding="async" />
      </div>

      <main>
        <section className="hm-hero">
          <div className="hm-faces hm-in" aria-hidden>
            {[1, 2, 3, 7, 4, 5, 6].map((n) => <img key={n} src={`/home/pile-${n}.webp`} alt="" width={64} height={64} />)}
          </div>
          <h1 className="hm-in" style={{ animationDelay: ".06s" }}>
            Tempat teman dan Kev-Ai <span className="hm-pill"><i /><PillWord /></span> bersama.
          </h1>
          <p className="hm-in" style={{ animationDelay: ".12s" }}>Chat pribadi dan grup, berita dari tim, serta asisten AI yang siap membantu, semuanya di satu ruang yang tenang.</p>
          <div className="hm-cta hm-in" style={{ animationDelay: ".18s" }}>
            <a className="hm-btn big" href={ctaFree.href}>{ctaFree.label}</a>
            <a className="hm-btn soft big" href="/cas">Tulis kritik &amp; saran</a>
          </div>
        </section>

        <section className="hm-trust hm-in" style={{ animationDelay: ".24s" }}>
          <p>Semua yang kamu butuh untuk ngobrol, ada di kevsoft.</p>
          <div className="hm-marq" aria-hidden>
            <div className="hm-track">
              {[...MARQUEE, ...MARQUEE].map((m, i) => <span key={i}>{m}</span>)}
            </div>
          </div>
        </section>

        <section className="hm-sec hm-dock-sec">
          <span className="hm-eyebrow">Coba di sini</span>
          <h2 className="hm-big sm">Tekan dikit, aplikasinya muncul.</h2>
          <p className="hm-lead">Tidak perlu daftar dulu untuk mengintip. Tekan salah satu ikon, jendelanya terbuka, lalu ketik, klik, dan geser sesukamu. Semua yang ada di panggung ini cuma contoh, jadi tidak ada yang tersimpan.</p>
          <Tips />
          <HomeApps news={news} />
        </section>

        <section className="hm-sec">
          <span className="hm-eyebrow">Dari nol sampai ngobrol</span>
          <h2 className="hm-big sm">Empat langkah, tanpa ribet</h2>
          <ol className="hm-steps">
            {[
              ["Daftar", "Pakai email, nanti ada kode OTP yang dikirim ke kotak masukmu. Bisa juga lewat akun Google kalau mau lebih singkat."],
              ["Rapikan profil", "Pasang foto, banner, nama, dan username. Username inilah yang dipakai orang untuk mencarimu dan men-tag kamu."],
              ["Masuk komunitas", "Kamu otomatis masuk ke ruang bersama Komunitas Kevsoft. Sapa dulu orang-orang di sana, atau buka obrolan pribadi."],
              ["Bikin grup sendiri", "Beri nama, tulis rules, lalu bagikan link berkode acak. Kalau kode bocor, reset saja dari info grup."],
            ].map(([t, d], i) => (
              <li key={t} className="hm-step"><span>{i + 1}</span><div><h3>{t}</h3><p>{d}</p></div></li>
            ))}
          </ol>
        </section>

        <section className="hm-sec">
          <span className="hm-eyebrow">Kamus kecil</span>
          <h2 className="hm-big sm">Istilah yang bakal sering kamu lihat</h2>
          <p className="hm-lead">Tekan kartunya untuk membalik.</p>
          <Glossary />
        </section>

        <section className="hm-sec hm-split">
          <div>
            <h2 className="hm-big">Kev-Ai ada di tempat kamu ngobrol.</h2>
            <p className="hm-lead">Tanya, minta ringkasan, atau cari ide tanpa pindah aplikasi. Panggil saja dengan @kev-ai di grup mana pun.</p>
            <a className="hm-btn soft" href="/chat">Coba sekarang</a>
          </div>
          <div className="hm-preview" aria-hidden>
            <div className="hm-pv-bar"><i /><i /><i /><span>Komunitas Kevsoft</span></div>
            <div className="hm-pv-body">
              <div className="hm-b l"><b>Rani</b>Ada yang tahu cara pakai API berita?</div>
              <div className="hm-b l"><b>Dimas</b>Ada kok di halaman docs, lengkap dengan contoh.</div>
              <div className="hm-b r">Mantap, langsung coba 👍</div>
              <div className="hm-b l ai"><b>Kev-Ai</b>Mau aku bantu tulis contoh requestnya?</div>
            </div>
          </div>
        </section>

        <section className="hm-sec">
          <h2 className="hm-big sm">Semua dalam satu tempat</h2>
          <div className="hm-grid">
            {FEATURES.map((f) => (
              <a key={f.title} className={`hm-card t-${f.tone}`} href={f.href}>
                <span className="hm-ico"><Icon n={f.icon} size={20} /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </a>
            ))}
          </div>
        </section>

        {news.length > 0 && (
          <section className="hm-sec">
            <div className="hm-sec-h"><h2 className="hm-big sm">Kabar terbaru</h2><a href="/news">Semua berita →</a></div>
            <div className="hm-news">
              {news.map((n) => (
                <a key={n.id} className="hm-card plain" href={`/news?id=${encodeURIComponent(n.id)}`}>
                  <small>{fmt(n.at)}</small>
                  <h3>{n.title}</h3>
                  {n.body && <p>{n.body}{n.body.length >= 120 ? "…" : ""}</p>}
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="hm-sec">
          <span className="hm-eyebrow">Sering ditanyakan</span>
          <h2 className="hm-big sm">Pertanyaan yang biasa muncul</h2>
          <div className="hm-faq">
            {[
              ["Perlu bayar?", "Tidak. Tombol “Mulai gratis” di atas memang begitu adanya: daftar, lalu langsung bisa dipakai."],
              ["Bagaimana cara memanggil Kev-Ai?", "Di grup, tulis @kev-ai diikuti pertanyaanmu. Misalnya “@kev-ai rangkum obrolan tadi”. Jawabannya muncul sebagai pesan di grup yang sama."],
              ["Pesan sementara itu apa?", "Fitur yang membuat pesan hilang sendiri setelah waktu yang dipilih. Dinyalakan per obrolan, jadi tidak memengaruhi obrolan lain."],
              ["Link grup saya bocor, bagaimana?", "Buka info grup lalu reset link. Kodenya diganti dengan kode acak baru, dan kode lama tidak bisa dipakai lagi."],
              ["Apa arti RM, ACC, dan LIKE?", "Itu tiga kata yang dipakai AI saat memilah komentar di Kritik & Saran. RM berarti dihapus, ACC diterima, LIKE komentar baik yang ditaruh paling atas. Kritik kasar tanpa isi dibuang, kritik yang mengandung saran tetap dipertimbangkan."],
              ["Siapa yang membaca kritik saya?", "AI memilah lebih dulu. Pemilik utama kevsoft juga bisa menghapus komentar yang tidak pantas."],
              ["Bisa ambil data berita ke aplikasi saya sendiri?", "Bisa. Berita, komentar, dan kritik & saran tersedia lewat API read-only. Contoh request dan bentuk balasannya ada di halaman dokumentasi."],
              ["Ganti tema terang dan gelap di mana?", "Tombol matahari/bulan di pojok kanan atas. Pilihanmu diingat di perangkat itu."],
            ].map(([q, a]) => (
              <details key={q}><summary>{q}<Icon n="down" size={18} /></summary><div><p>{a}</p></div></details>
            ))}
          </div>
        </section>

        <section className="hm-sec">
          <div className="hm-cas">
            <div className="hm-cas-t">
              <span className="hm-eyebrow">Kritik &amp; Saran</span>
              <h2 className="hm-big sm">Suaramu membentuk kevsoft</h2>
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
