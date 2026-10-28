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

const databaseUrl = String(f.databaseUrl ?? "").trim();
// Kunci sesi/OTP TIDAK perlu diisi manual: diturunkan otomatis dari databaseUrl (berisi password database yang rahasia dan acak).
// Konsekuensi: mengganti password database otomatis mengeluarkan semua sesi login (itu hal yang baik setelah rotasi).
const DB_OK = /^postgres(ql)?:\/\/[^:/\s]+:[^@\s]{8,}@[^/\s]+\//.test(databaseUrl) && !/user:pass@|ep-xxx|GANTI/i.test(databaseUrl);

export const cfg = {
  databaseUrl,
  otpSecret: DB_OK ? `kevsoft-chat|session-and-otp|v1|${databaseUrl}` : "",
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

// Tanpa databaseUrl yang valid tidak ada kunci sesi yang aman: aplikasi menolak melayani (503 dengan pesan jelas).
export const configIssue: string | null = DB_OK
  ? null
  : "Konfigurasi belum lengkap: databaseUrl di config.json masih kosong atau placeholder.";
