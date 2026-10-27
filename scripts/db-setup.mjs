// Menjalankan schema.sql ke Neon: npm run db:setup
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const url = JSON.parse(fs.readFileSync(new URL("../config.json", import.meta.url), "utf8")).databaseUrl;
if (!url) { console.error("databaseUrl belum diisi di config.json"); process.exit(1); }
const sql = neon(url);
const stmts = fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8")
  .split(";").map(s => s.trim()).filter(Boolean);
for (const s of stmts) { await (sql.query ? sql.query(s) : sql(s)); console.log("ok:", s.split("\n")[0]); }
const rows = await sql`select table_name from information_schema.tables where table_schema='public' order by 1`;
console.log("Tabel:", rows.map(r => r.table_name).join(", "));
