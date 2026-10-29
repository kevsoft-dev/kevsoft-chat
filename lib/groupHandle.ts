import { sql } from "./db";
import { RESERVED, USERNAME_RE } from "./mentions";

export function slugifyTitle(title: string): string {
  let s = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 20);
  if (s.length < 3) s = (s + "_group").slice(0, 20);
  // pastikan cocok USERNAME_RE
  if (!/^[a-z0-9_]/.test(s)) s = "g_" + s;
  if (!/[a-z0-9_]$/.test(s)) s = s + "0";
  s = s.slice(0, 20);
  if (!USERNAME_RE.test(s)) {
    s = ("g" + s.replace(/[^a-z0-9_]/g, "")).slice(0, 19) + "0";
  }
  return s;
}

export async function uniqueGroupHandle(base: string): Promise<string> {
  let candidate = base.toLowerCase();
  if (RESERVED.includes(candidate) || !USERNAME_RE.test(candidate)) {
    candidate = slugifyTitle(base || "group");
  }
  for (let i = 0; i < 30; i++) {
    const tryH = i === 0 ? candidate : `${candidate.slice(0, 16)}_${i}`.slice(0, 20);
    if (!USERNAME_RE.test(tryH) || RESERVED.includes(tryH)) continue;
    const [user] = await sql`select 1 from users where lower(username) = ${tryH} limit 1`;
    if (user) continue;
    const [grp] = await sql`select 1 from conversations where lower(handle) = ${tryH} limit 1`;
    if (grp) continue;
    return tryH;
  }
  // fallback random
  const rand = "g" + Math.random().toString(36).slice(2, 10);
  return rand;
}

export function handleProblem(h: string): string | null {
  const s = h.trim().toLowerCase();
  if (!USERNAME_RE.test(s)) return "Handle 3-20 karakter: huruf kecil, angka, _ . -";
  if (RESERVED.includes(s)) return "Handle ini dicadangkan";
  return null;
}
