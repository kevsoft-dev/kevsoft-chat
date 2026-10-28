import { createHash } from "crypto";
import { cfg } from "./config";

// Role global: user < admin < owner. Owner utama (root) dibaca dari config.json -> "owners".
export type Role = "user" | "admin" | "owner";
export const ROLES: Role[] = ["user", "admin", "owner"];

const configured = ((cfg as { owners?: string[] }).owners ?? ["kevsoft.cs@gmail.com"]) as string[];
export const ROOT_OWNERS = configured.map((e) => e.trim().toLowerCase()).filter(Boolean);

export const isRootEmail = (email?: string | null) => !!email && ROOT_OWNERS.includes(email.trim().toLowerCase());
export const rank = (r?: string | null) => (r === "owner" ? 2 : r === "admin" ? 1 : 0);
export const isStaff = (r?: string | null) => rank(r) >= 1;
export const userIdForEmail = (email: string) => "u_" + createHash("sha256").update(email).digest("hex").slice(0, 32);

export type Person = { id: string; role: string; email: string | null };

// Aturan siapa boleh menindak siapa:
// - tidak bisa menindak diri sendiri dan owner utama (root) tidak bisa disentuh siapa pun
// - admin hanya bisa menindak user biasa
// - owner bisa menindak user dan admin; owner lain hanya bisa disentuh oleh owner utama
export function canManage(actor: Person, target: Person) {
  if (actor.id === target.id) return false;
  if (isRootEmail(target.email)) return false;
  const a = rank(actor.role), t = rank(target.role);
  if (a === 2) return t < 2 || isRootEmail(actor.email);
  if (a === 1) return t === 0;
  return false;
}
