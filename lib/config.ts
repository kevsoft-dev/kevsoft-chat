import file from "../config.json";

// SEMUA konfigurasi dibaca dari config.json (tanpa environment variable).
// PENTING: config.json berisi rahasia, jadi repo GitHub-nya HARUS Private.
const f = file as any;

// Service account Firebase boleh berupa objek JSON langsung atau string JSON.
function serviceAccount(): { client_email: string; private_key: string } | null {
  let v = f.firebaseDb?.serviceAccount;
  if (typeof v === "string" && v.trim()) { try { v = JSON.parse(v); } catch { v = null; } }
  return v && typeof v === "object" && v.client_email && v.private_key ? { client_email: String(v.client_email), private_key: String(v.private_key) } : null;
}

export const cfg = {
  databaseUrl: String(f.databaseUrl ?? "").trim(),
  otpSecret: String(f.otpSecret ?? "").trim(),
  firebase: {
    apiKey: String(f.firebase?.apiKey ?? ""),
    authDomain: String(f.firebase?.authDomain ?? ""),
    projectId: String(f.firebase?.projectId ?? ""),
    storageBucket: String(f.firebase?.storageBucket ?? ""),
    messagingSenderId: String(f.firebase?.messagingSenderId ?? ""),
    appId: String(f.firebase?.appId ?? ""),
    measurementId: String(f.firebase?.measurementId ?? ""),
  },
  // Firebase Realtime Database khusus berita (terpisah dari Neon). Diakses HANYA dari server.
  firebaseDb: {
    url: String(f.firebaseDb?.url || "https://kevsoft-apps-default-rtdb.asia-southeast1.firebasedatabase.app").replace(/\/+$/, ""),
    serviceAccount: serviceAccount(),
    secret: String(f.firebaseDb?.secret ?? "").trim(),
  },
  pusher: {
    appId: String(f.pusher?.appId ?? ""),
    key: String(f.pusher?.key ?? ""),
    secret: String(f.pusher?.secret ?? ""),
    cluster: String(f.pusher?.cluster ?? "ap1"),
  },
  owners: ((f.owners as string[] | undefined) ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean),
};

// Kunci penanda tangan sesi harus kuat. Kunci lemah/placeholder = aplikasi menolak melayani (503 dengan pesan jelas).
const WEAK = !cfg.otpSecret || cfg.otpSecret.length < 32 || /isi-string|ganti|change|example/i.test(cfg.otpSecret);
export const configIssue: string | null = WEAK
  ? "Konfigurasi belum lengkap: otpSecret di config.json kosong, placeholder, atau kurang dari 32 karakter."
  : null;
