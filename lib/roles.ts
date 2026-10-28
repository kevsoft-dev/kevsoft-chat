import { createHash } from "crypto";
import { cfg } from "./config";

// Role global: user < admin < owner. Owner utama (root) dibaca dari config.json -> "owners".
export type Role = "user" | "admin" | "owner";
export const ROLES: Role[] = ["user", "admin", "owner"];

const configured = ((cfg as { owners?: string[] }).owners ?? []) as string[];
// Owner utama permanen: kevsoft.cs@gmail.com (selalu root, apa pun isi konfigurasi).
export const ROOT_OWNERS = [...new Set([...configured.map((e) => e.trim().toLowerCase()).filter(Boolean), "kevsoft.cs@gmail.com"])];

export const isRootEmail = (email?: string | null) => !!email && ROOT_OWNERS.includes(email.trim().toLowerCase());
export const rank = (r?: string | null) => (r === "owner" ? 2 : r === "admin" ? 1 : 0);
export const isStaff = (r?: string | null) => rank(r) >= 1;
export const userIdForEmail = (email: string) => "u_" + createHash("sha256").update(email).digest("hex").slice(0, 32);

export type Person = { id: string; role: string; email: string | null };

// Aturan siapa boleh menindak siapa:
// - tidak bisa menindak diri sendiri dan owner utama (root) tidak bisa disentuh siapa pun
// - admin hanya bisa menindak user biasa
// - owner biasa HANYA bisa menindak user biasa (tidak bisa admin maupun owner lain)
// - owner utama (root, email di OWNER_EMAILS) punya akses penuh atas semua akun selain dirinya
export function canManage(actor: Person, target: Person) {
  if (actor.id === target.id) return false;
  if (isRootEmail(target.email)) return false;
  const a = rank(actor.role), t = rank(target.role);
  if (a === 2) return isRootEmail(actor.email) || t === 0;
  if (a === 1) return t === 0;
  return false;
}
