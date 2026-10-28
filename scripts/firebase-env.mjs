// Ubah file JSON service account menjadi SATU baris untuk env FIREBASE_SERVICE_ACCOUNT.
// Pakai:  node scripts/firebase-env.mjs path/ke/service-account.json
// Salin hasilnya ke Environment Variables hosting. Jangan commit file JSON-nya.
import fs from "node:fs";
const f = process.argv[2];
if (!f) { console.error("Pakai: node scripts/firebase-env.mjs <file.json>"); process.exit(1); }
const j = JSON.parse(fs.readFileSync(f, "utf8"));
if (!j.client_email || !j.private_key) { console.error("Bukan file service account yang valid"); process.exit(1); }
console.log(JSON.stringify({ client_email: j.client_email, private_key: j.private_key, project_id: j.project_id }));
