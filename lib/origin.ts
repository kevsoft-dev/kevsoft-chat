/**
 * Deteksi domain / origin yang sedang dipakai secara otomatis.
 * Aman di belakang Vercel, Cloudflare, nginx, dsb.
 *
 * Prioritas:
 * 1. x-forwarded-host + x-forwarded-proto (proxy / CDN)
 * 2. host header
 * 3. URL request (fallback)
 */
export function getRequestOrigin(req: Request): string {
  const h = req.headers;

  // Proxy / CDN (Vercel, Cloudflare, nginx reverse proxy)
  const xfHost = (h.get("x-forwarded-host") || "").split(",")[0]?.trim();
  const xfProto = (h.get("x-forwarded-proto") || "").split(",")[0]?.trim().toLowerCase();

  if (xfHost && /^[a-z0-9.-]+(?::\d+)?$/i.test(xfHost)) {
    const proto = xfProto === "http" || xfProto === "https" ? xfProto : "https";
    return `${proto}://${xfHost}`.replace(/\/+$/, "");
  }

  // Host langsung
  const host = (h.get("host") || "").trim();
  if (host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    // Di production biasanya https; di local http
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
    const proto = isLocal ? "http" : (xfProto === "http" ? "http" : "https");
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  // Fallback dari URL request
  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

/** Hostname saja (tanpa protokol), untuk display / log. */
export function getRequestHost(req: Request): string {
  try {
    return new URL(getRequestOrigin(req)).host;
  } catch {
    return "localhost";
  }
}
