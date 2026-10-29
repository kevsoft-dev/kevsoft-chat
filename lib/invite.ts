// Dipakai di server dan client (tanpa import server-only).
import { USERNAME_RE } from "./mentions";

// Kode undangan: 16 karakter acak (huruf besar/kecil, angka, - dan _), peka huruf besar-kecil.
export const INVITE_RE = /^[A-Za-z0-9_-]{16}$/;

// Terima link undangan (…/join/KODE), kode polos, atau @username / link username grup.
// Kode polos 16 karakter bisa juga username, jadi dua-duanya dikembalikan dan dicoba berurutan.
export function parseInvite(input: string): { code?: string; handle?: string } {
  const s = input.trim();
  if (!s) return {};
  const m = s.match(/\/join\/([A-Za-z0-9_-]{16})(?:[/?#]|$)/);
  if (m) return { code: m[1] };
  const out: { code?: string; handle?: string } = {};
  if (INVITE_RE.test(s)) out.code = s;
  const h = s.replace(/^https?:\/\/[^/]+\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "").toLowerCase();
  if (USERNAME_RE.test(h)) out.handle = h;
  return out;
}
