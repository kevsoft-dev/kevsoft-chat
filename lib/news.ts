// Validasi berita (server). Gambar/video HANYA berupa URL https (tidak ada upload file).
export type NewsButton = { label: string; url: string };

export const safeUrl = (u: unknown): string | null => {
  try { const x = new URL(String(u ?? "").trim()); return x.protocol === "https:" && x.hostname.includes(".") ? x.toString().slice(0, 500) : null; } catch { return null; }
};

export function cleanButtons(raw: unknown): NewsButton[] {
  if (!Array.isArray(raw)) return [];
  const out: NewsButton[] = [];
  for (const b of raw.slice(0, 3)) {
    const label = String((b as any)?.label ?? "").trim().slice(0, 24);
    const url = safeUrl((b as any)?.url);
    if (label && url) out.push({ label, url });
  }
  return out;
}

export function cleanUrls(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(safeUrl).filter((u): u is string => !!u))].slice(0, max);
}
