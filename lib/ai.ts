// Kev-Ai: GET https://kev-ai.vercel.app/ai?text=  (dipakai chat @kev-ai DAN peninjau AI di /cas lewat lib/cas.ts)
const ENDPOINT = "https://kev-ai.vercel.app/ai?text=";
const KEYS = ["result", "response", "answer", "reply", "message", "text", "output", "content", "data"];

function pick(v: unknown, depth = 0): string | null {
  if (typeof v === "string") return v;
  if (!v || typeof v !== "object" || depth > 3) return null;
  const o = v as Record<string, unknown>;
  for (const k of KEYS) if (k in o) { const r = pick(o[k], depth + 1); if (r) return r; }
  return null;
}

export async function askKevAi(text: string): Promise<string> {
  const ctrl = new AbortController();
  // Timeout lebih ketat supaya UI tidak “menggantung” terlalu lama
  const timer = setTimeout(() => ctrl.abort(), 22_000);
  try {
    const r = await fetch(ENDPOINT + encodeURIComponent(text.slice(0, 1800)), {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { Accept: "application/json, text/plain;q=0.9,*/*;q=0.8" },
    });
    const raw = (await r.text()).trim();
    if (!r.ok) throw new Error(String(r.status));
    let out = raw;
    try { out = pick(JSON.parse(raw)) ?? raw; } catch {}
    out = out.trim();
    if (!out) throw new Error("empty");
    return out.length > 3900 ? out.slice(0, 3900) + "…" : out;
  } catch {
    return "Maaf, Kev-Ai lagi tidak bisa menjawab. Coba lagi sebentar.";
  } finally {
    clearTimeout(timer);
  }
}
