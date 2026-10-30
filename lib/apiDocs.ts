// Sumber tunggal dokumentasi API publik (/docs). Tambah endpoint baru cukup di sini.
export type Param = { name: string; type: string; desc: string; required?: boolean };
export type Endpoint = {
  id: string; method: "GET"; path: string; title: string; desc: string;
  params?: Param[]; sample: unknown;
  tryQuery?: string;
};

const user = { username: "kevin", name: "Kevin", avatar_url: "/api/avatar/abc", verified: true, role: "owner" };

const comment = {
  id: "-Nc1", parent_id: null, body: "Keren!", mentions: [] as string[],
  created_at: "2026-10-01T04:00:00.000Z", user,
};

export const ENDPOINTS: Endpoint[] = [
  {
    id: "news-list", method: "GET", path: "/api/v1/news", title: "Daftar berita",
    desc: "Publik 100% (tanpa API key). Berita terbaru → terlama. Pakai all=1 untuk mengambil SEMUA berita beserta SEMUA komentar dalam satu request.",
    params: [
      { name: "all", type: "0 | 1", desc: "1 = semua berita + semua komentar (data lengkap). Abaikan limit/before." },
      { name: "comments", type: "0 | 1", desc: "1 = sertakan komentar per berita (meski tanpa all)." },
      { name: "tree", type: "0 | 1", desc: "1 = komentar bersarang di field replies (butuh all/comments)." },
      { name: "limit", type: "integer", desc: "Jumlah item, 1–200 (default 20). Diabaikan jika all=1." },
      { name: "before", type: "string", desc: "Cursor dari next_cursor respons sebelumnya." },
      { name: "q", type: "string", desc: "Cari di judul/isi (maks. 60 karakter)." },
    ],
    tryQuery: "all=1",
    sample: {
      data: [{
        id: "-Nabc123", title: "Judul berita", body: "Isi berita…",
        buttons: [{ label: "Buka", url: "https://contoh.com" }], images: ["https://contoh.com/a.jpg"], videos: [],
        author: "Kevsoft", created_at: "2026-10-01T03:00:00.000Z", likes: 12, comments: 3, shares: 1,
        comments_count: 1,
        comments: [comment],
      }],
      count: 1, next_cursor: null, complete: true, includes: "comments",
    },
  },
  {
    id: "news-one", method: "GET", path: "/api/v1/news/{id}", title: "Satu berita",
    desc: "Publik 100% (tanpa API key). Detail satu berita. Tambah comments=1 untuk menyertakan semua komentar.",
    params: [
      { name: "id", type: "string", required: true, desc: "ID berita (path)." },
      { name: "comments", type: "0 | 1", desc: "1 = sertakan semua komentar." },
      { name: "tree", type: "0 | 1", desc: "1 = komentar bersarang." },
    ],
    tryQuery: "comments=1&tree=1",
    sample: {
      data: {
        id: "-Nabc123", title: "Judul berita", body: "Isi berita…", buttons: [], images: [], videos: [],
        author: "Kevsoft", created_at: "2026-10-01T03:00:00.000Z", likes: 12, comments: 3, shares: 1,
        comments_count: 1, comments: [comment],
      },
    },
  },
  {
    id: "news-comments", method: "GET", path: "/api/v1/news/{id}/comments", title: "Komentar berita",
    desc: "Publik 100% (tanpa API key). Semua komentar sebuah berita, urut lama → baru. tree=1 membuat balasan bersarang di replies.",
    params: [
      { name: "id", type: "string", required: true, desc: "ID berita (path)." },
      { name: "tree", type: "0 | 1", desc: "1 = balasan bersarang (field replies)." },
    ],
    tryQuery: "tree=1",
    sample: {
      news_id: "-Nabc123", count: 1,
      data: [comment],
    },
  },
  {
    id: "cas-list", method: "GET", path: "/api/v1/cas", title: "Daftar Kritik & Saran",
    desc: "Komentar /cas yang lolos peninjauan AI (status acc atau like). Mungkin memerlukan API key (lihat Mode Developer) jika api.public=false.",
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
    desc: "Ringkasan singkat API (JSON). Terbuka, tanpa key dan tanpa data sensitif.",
    sample: { name: "kevsoft API", version: "v1", access: "read-only", news_and_comments: "Publik 100%", endpoints: ["…"] },
  },
];

export const ERRORS: { code: number; when: string }[] = [
  { code: 400, when: "Parameter atau ID tidak valid." },
  { code: 401, when: "API key tidak ada atau salah (hanya untuk endpoint CAS jika api.public=false)." },
  { code: 404, when: "Data tidak ditemukan." },
  { code: 429, when: "Rate limit terlampaui (news/comments: 180/menit per IP; lainnya 120/menit). Lihat header Retry-After." },
  { code: 502, when: "Database sedang bermasalah. Coba lagi nanti." },
  { code: 503, when: "Database / Firebase belum dikonfigurasi." },
];
