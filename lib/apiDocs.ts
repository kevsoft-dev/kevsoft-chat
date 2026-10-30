// Sumber tunggal dokumentasi API publik (/docs). Tambah endpoint baru cukup di sini.
export type Param = { name: string; type: string; desc: string; required?: boolean };
export type Endpoint = {
  id: string; method: "GET"; path: string; title: string; desc: string;
  params?: Param[]; sample: unknown;
  // Isian awal di "Coba langsung"; {id} diisi pengguna.
  tryQuery?: string;
};

const user = { username: "kevin", name: "Kevin", avatar_url: "https://domainmu.com/api/avatar/abc", verified: true, role: "owner" };

export const ENDPOINTS: Endpoint[] = [
  {
    id: "news-list", method: "GET", path: "/api/v1/news", title: "Daftar berita",
    desc: "Berita Kevsoft terbaru ke terlama. Untuk halaman berikutnya kirim next_cursor sebagai before.",
    params: [
      { name: "limit", type: "integer", desc: "Jumlah item, 1-50 (default 20)." },
      { name: "before", type: "string", desc: "Cursor dari next_cursor respons sebelumnya." },
      { name: "q", type: "string", desc: "Cari di judul/isi (maks. 60 karakter)." },
    ],
    tryQuery: "limit=5",
    sample: {
      data: [{
        id: "-Nabc123", title: "Judul berita", body: "Isi berita…",
        buttons: [{ label: "Buka", url: "https://contoh.com" }], images: ["https://contoh.com/a.jpg"], videos: [],
        author: "Kevsoft", created_at: "2026-10-01T03:00:00.000Z", likes: 12, comments: 3, shares: 1,
      }],
      count: 1, next_cursor: null,
    },
  },
  {
    id: "news-one", method: "GET", path: "/api/v1/news/{id}", title: "Satu berita",
    desc: "Detail satu berita berdasarkan id.",
    params: [{ name: "id", type: "string", required: true, desc: "ID berita (path)." }],
    sample: { data: { id: "-Nabc123", title: "Judul berita", body: "Isi berita…", buttons: [], images: [], videos: [], author: "Kevsoft", created_at: "2026-10-01T03:00:00.000Z", likes: 12, comments: 3, shares: 1 } },
  },
  {
    id: "news-comments", method: "GET", path: "/api/v1/news/{id}/comments", title: "Komentar berita",
    desc: "Komentar sebuah berita, urut lama ke baru. Dengan tree=1 balasan dibuat bersarang di replies.",
    params: [
      { name: "id", type: "string", required: true, desc: "ID berita (path)." },
      { name: "tree", type: "0 | 1", desc: "1 = balasan bersarang (field replies)." },
    ],
    tryQuery: "tree=1",
    sample: {
      news_id: "-Nabc123", count: 1,
      data: [{ id: "-Nc1", parent_id: null, body: "Keren!", mentions: [], created_at: "2026-10-01T04:00:00.000Z", user }],
    },
  },
  {
    id: "cas-list", method: "GET", path: "/api/v1/cas", title: "Daftar Kritik & Saran",
    desc: "Komentar /cas yang lolos peninjauan AI (status acc atau like). Komentar yang masih ditinjau atau ditolak tidak pernah muncul.",
    params: [
      { name: "type", type: "string", desc: "kritik, saran, atau lainnya." },
      { name: "status", type: "string", desc: "like atau acc." },
      { name: "sort", type: "string", desc: "best (LIKE dulu, default) atau new (terbaru)." },
      { name: "limit", type: "integer", desc: "Jumlah item, 1-100 (default 50)." },
    ],
    tryQuery: "sort=best&limit=10",
    sample: {
      total: 1, count: 1,
      data: [{ id: "-Ncas1", body: "Tolong tambah mode terang yang lebih lembut.", type: "saran", status: "like", created_at: "2026-10-02T05:00:00.000Z", reviewed_at: "2026-10-02T05:00:09.000Z", user }],
    },
  },
  {
    id: "cas-one", method: "GET", path: "/api/v1/cas/{id}", title: "Satu Kritik & Saran",
    desc: "Satu komentar /cas yang sudah lolos peninjauan.",
    params: [{ name: "id", type: "string", required: true, desc: "ID komentar (path)." }],
    sample: { data: { id: "-Ncas1", body: "Tolong tambah mode terang yang lebih lembut.", type: "saran", status: "like", created_at: "2026-10-02T05:00:00.000Z", reviewed_at: "2026-10-02T05:00:09.000Z", user } },
  },
  {
    id: "index", method: "GET", path: "/api/v1", title: "Indeks API",
    desc: "Ringkasan singkat API (JSON). Terbuka, tanpa key dan tanpa data.",
    sample: { name: "kevsoft API", version: "v1", access: "read-only", endpoints: ["…"] },
  },
  {
    id: "me-get", method: "GET", path: "/api/v1/me", title: "Akun API",
    desc: "Pemilik key developer dan batasnya. Hanya untuk key developer (kc_live_…), bukan key dari config server.",
    sample: { data: { developer: { username: "kevin", name: "Kevin" }, key: { id: "b1f0…", name: "bot berita", prefix: "kc_live_Ab3x", created_at: "2026-10-31T03:00:00.000Z", last_used: null }, limits: { per_minute: 300 } } },
  },
];

export const ERRORS: { code: number; when: string }[] = [
  { code: 400, when: "Parameter atau ID tidak valid." },
  { code: 401, when: "API key tidak ada, salah, atau sudah dicabut (saat API tidak publik)." },
  { code: 403, when: "Endpoint hanya untuk key developer, tetapi key yang dipakai berasal dari config server." },
  { code: 404, when: "Data tidak ditemukan." },
  { code: 429, when: "Batas permintaan terlampaui (300/menit untuk key developer, 120/menit untuk lainnya), atau terlalu banyak key salah. Lihat header Retry-After." },
  { code: 502, when: "Database sedang bermasalah. Coba lagi nanti." },
  { code: 503, when: "API belum diaktifkan di config.json, atau database belum dikonfigurasi." },
];
