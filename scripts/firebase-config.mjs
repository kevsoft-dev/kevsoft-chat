// Masukkan service account Firebase ke config.json (tanpa env).
// Pakai:  node scripts/firebase-config.mjs path/ke/service-account.json
// Setelah itu HAPUS file JSON aslinya dan pastikan repo GitHub kamu PRIVATE.
import fs from "node:fs";
const src = process.argv[2];
if (!src) { console.error("Pakai: node scripts/firebase-config.mjs <service-account.json>"); process.exit(1); }
const j = JSON.parse(fs.readFileSync(src, "utf8"));
if (!j.client_email || !j.private_key) { console.error("Bukan file service account yang valid"); process.exit(1); }
const cfgPath = new URL("../config.json", import.meta.url);
const c = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
c.firebaseDb = { ...(c.firebaseDb || {}), serviceAccount: { client_email: j.client_email, private_key: j.private_key } };
fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2));
console.log("OK: service account tersimpan di config.json");
