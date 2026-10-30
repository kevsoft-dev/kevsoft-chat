// Mengubah content/docs/*.md menjadi lib/docsContent.ts. Jalankan: node scripts/build-docs.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../content/docs/", import.meta.url);
const pages = readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => {
  const raw = readFileSync(new URL(f, dir), "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${f}: front matter hilang`);
  const meta = Object.fromEntries(m[1].split("\n").map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  return { id: f.replace(/\.md$/, ""), title: meta.title, group: meta.group, order: Number(meta.order), desc: meta.desc ?? "", body: m[2].trim() };
}).sort((a, b) => a.order - b.order);
const out = `// DIHASILKAN oleh scripts/build-docs.mjs dari content/docs/*.md. Jangan edit manual.\nexport type DocPage = { id: string; title: string; group: string; order: number; desc: string; body: string };\nexport const DOC_PAGES: DocPage[] = ${JSON.stringify(pages, null, 1)};\n`;
writeFileSync(new URL("../lib/docsContent.ts", import.meta.url), out);
console.log(pages.length, "halaman");
