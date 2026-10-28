import file from "../config.json";

// Konfigurasi: environment variable diutamakan (aman untuk produksi), config.json jadi cadangan untuk dev lokal.
// JANGAN commit rahasia asli ke config.json. Isi lewat env di hosting (Vercel -> Settings -> Environment Variables).
const env = (k: string) => (process.env[k] ?? "").trim();
const f = file as any;

export const cfg = {
  databaseUrl: env("DATABASE_URL") || String(f.databaseUrl ?? ""),
  otpSecret: env("OTP_SECRET") || String(f.otpSecret ?? ""),
  firebase: {
    apiKey: env("FIREBASE_API_KEY") || String(f.firebase?.apiKey ?? ""),
    authDomain: env("FIREBASE_AUTH_DOMAIN") || String(f.firebase?.authDomain ?? ""),
    projectId: env("FIREBASE_PROJECT_ID") || String(f.firebase?.projectId ?? ""),
    storageBucket: env("FIREBASE_STORAGE_BUCKET") || String(f.firebase?.storageBucket ?? ""),
    messagingSenderId: env("FIREBASE_MESSAGING_SENDER_ID") || String(f.firebase?.messagingSenderId ?? ""),
    appId: env("FIREBASE_APP_ID") || String(f.firebase?.appId ?? ""),
    measurementId: env("FIREBASE_MEASUREMENT_ID") || String(f.firebase?.measurementId ?? ""),
  },
  pusher: {
    appId: env("PUSHER_APP_ID") || String(f.pusher?.appId ?? ""),
    key: env("PUSHER_KEY") || String(f.pusher?.key ?? ""),
    secret: env("PUSHER_SECRET") || String(f.pusher?.secret ?? ""),
    cluster: env("PUSHER_CLUSTER") || String(f.pusher?.cluster ?? "ap1"),
  },
  owners: (env("OWNER_EMAILS") ? env("OWNER_EMAILS").split(",") : ((f.owners as string[] | undefined) ?? [])).map((e) => e.trim().toLowerCase()).filter(Boolean),
};

// Kunci penanda tangan sesi harus kuat. Di produksi, kunci lemah/placeholder = aplikasi menolak jalan.
const WEAK = !cfg.otpSecret || cfg.otpSecret.length < 32 || /isi-string|change|secret|example/i.test(cfg.otpSecret);
if (WEAK && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build")
  throw new Error("OTP_SECRET belum diatur atau terlalu lemah (minimal 32 karakter). Buat dengan: openssl rand -hex 32");
