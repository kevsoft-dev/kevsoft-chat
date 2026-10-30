import { cfg } from "@/lib/config";
import { getRequestOrigin } from "@/lib/origin";
import { preflight, reply } from "@/lib/publicApi";

export const OPTIONS = preflight;

// Dokumentasi singkat (terbuka, tanpa data).
export async function GET(req: Request) {
  const origin = getRequestOrigin(req);
  return reply({
    name: "kevsoft API",
    version: "v1",
    access: "read-only",
    news_and_comments: "Publik 100% — tanpa API key. Rate limit 180 req/menit per IP.",
    cas_auth: cfg.api.public
      ? "CAS juga terbuka (tanpa key), dibatasi 120 permintaan/menit per IP."
      : "CAS butuh API key: header x-api-key (atau Authorization: Bearer). Batas 120 req/menit per key.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/news",
        query: "all=1 (semua berita + komentar lengkap), limit, before, q, comments=1, tree=1",
        desc: "Daftar berita. all=1 = satu request untuk SEMUA berita beserta komentarnya.",
        auth: "public",
      },
      {
        method: "GET",
        path: "/api/v1/news/{id}",
        query: "comments=1, tree=1",
        desc: "Satu berita (opsional + komentar lengkap)",
        auth: "public",
      },
      {
        method: "GET",
        path: "/api/v1/news/{id}/comments",
        query: "tree=1",
        desc: "Semua komentar sebuah berita",
        auth: "public",
      },
      {
        method: "GET",
        path: "/api/v1/cas",
        query: "type, status, sort, limit",
        desc: "Kritik & Saran yang lolos peninjauan AI",
        auth: cfg.api.public ? "public" : "api-key",
      },
      {
        method: "GET",
        path: "/api/v1/cas/{id}",
        desc: "Satu komentar Kritik & Saran",
        auth: cfg.api.public ? "public" : "api-key",
      },
    ],
    domain: origin,
    docs: `${origin}/docs`,
    examples: {
      all_news_with_comments: `curl "${origin}/api/v1/news?all=1"`,
      one_news: `curl "${origin}/api/v1/news/{id}?comments=1&tree=1"`,
      comments_only: `curl "${origin}/api/v1/news/{id}/comments?tree=1"`,
    },
  });
}
