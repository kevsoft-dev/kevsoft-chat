import { cfg } from "@/lib/config";
import { preflight, reply } from "@/lib/publicApi";

export const OPTIONS = preflight;

// Dokumentasi singkat (terbuka, tanpa data).
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return reply({
    name: "kevsoft API",
    version: "v1",
    access: "read-only",
    auth: cfg.api.public
      ? "Terbuka (tanpa key), dibatasi 120 permintaan/menit per IP."
      : "Wajib API key: header x-api-key: <key> (atau Authorization: Bearer <key>). Batas 120 permintaan/menit per key.",
    endpoints: [
      { method: "GET", path: "/api/v1/news", query: "limit (1-50, default 20), before (id berita untuk halaman berikutnya), q (cari di judul/isi)", desc: "Daftar berita terbaru" },
      { method: "GET", path: "/api/v1/news/{id}", desc: "Satu berita" },
      { method: "GET", path: "/api/v1/news/{id}/comments", query: "tree=1 (balasan bersarang)", desc: "Komentar sebuah berita" },
      { method: "GET", path: "/api/v1/cas", query: "type (kritik|saran|lainnya), status (like|acc), sort (best|new), limit (1-100, default 50)", desc: "Komentar Kritik & Saran yang lolos peninjauan AI" },
      { method: "GET", path: "/api/v1/cas/{id}", desc: "Satu komentar Kritik & Saran" },
    ],
    example: `curl -H "x-api-key: KUNCI_KAMU" ${origin}/api/v1/news?limit=5`,
  });
}
