const prod = process.env.NODE_ENV === "production";

// Content-Security-Policy. 'unsafe-inline' script dibutuhkan skrip tema di layout dan skrip bawaan Next.
// Firebase (login Google lewat popup), Google Fonts, dan Pusher (realtime) diizinkan secara eksplisit.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://apis.google.com${prod ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.google.com https://*.pusher.com wss://*.pusher.com",
  "media-src 'self' blob: https:",
  "frame-src https://*.firebaseapp.com https://accounts.google.com https://*.google.com https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(prod ? ["upgrade-insecure-requests"] : []),
].join("; ");

const headers = [
  { key: "Content-Security-Policy" /* ganti ke "Content-Security-Policy-Report-Only" untuk uji tanpa memblokir */, value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];
// Ruang privat (/ghosh), console, dan API-nya: jangan diindeks, jangan bocorkan referrer, jangan di-cache.
const priv = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
  { key: "Cache-Control", value: "no-store, max-age=0" },
];
export default {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers },
      { source: "/ghosh", headers: priv },
      { source: "/console", headers: priv },
      { source: "/api/ghosh/:path*", headers: priv },
    ];
  },
};
