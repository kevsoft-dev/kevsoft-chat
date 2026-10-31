// Rute halaman chat. Murni fungsi (aman dipakai di server maupun client).
//
//   /chat                 daftar chat
//   /chat/dm              daftar chat, tab Pribadi
//   /chat/dm/{username}   chat pribadi
//   /chat/grup            daftar chat, tab Grup
//   /chat/grup/{id}       grup / komunitas (id percakapan; handle grup juga diterima)
//   /chat/ai              chat dengan Kev-Ai
import type { Conv } from "@/components/ui";

export type ChatTab = "all" | "dm" | "group";
export type ChatRoute =
  | { kind: "list"; tab: ChatTab }
  | { kind: "dm"; key: string }
  | { kind: "grup"; key: string }
  | { kind: "ai" };

export function parseChatPath(pathname: string): ChatRoute {
  let p = pathname.split("?")[0].split("#")[0];
  try { p = decodeURIComponent(p); } catch {}
  const seg = p.split("/").filter(Boolean);
  if (seg[0] !== "chat") return { kind: "list", tab: "all" };
  const [, a, b] = seg;
  if (a === "ai") return { kind: "ai" };
  if (a === "dm") return b ? { kind: "dm", key: b.replace(/^@/, "").toLowerCase() } : { kind: "list", tab: "dm" };
  if (a === "grup") return b ? { kind: "grup", key: b.replace(/^@/, "").toLowerCase() } : { kind: "list", tab: "group" };
  return { kind: "list", tab: "all" };
}

export const routeKey = (r: ChatRoute) =>
  r.kind === "list" ? `list:${r.tab}` : r.kind === "ai" ? "ai" : `${r.kind}:${r.key}`;

export const tabPath = (t: ChatTab) => (t === "dm" ? "/chat/dm" : t === "group" ? "/chat/grup" : "/chat");

type PathConv = Pick<Conv, "id" | "kind" | "other_username">;

/** Alamat kanonik sebuah percakapan. */
export function chatPath(c: PathConv): string {
  if (c.kind === "ai") return "/chat/ai";
  if (c.kind === "dm" && c.other_username) return `/chat/dm/${encodeURIComponent(c.other_username.toLowerCase())}`;
  return `/chat/grup/${c.id}`;
}

/** Cari percakapan yang cocok dengan rute (null kalau tidak ada di daftar). */
export function findConv(r: ChatRoute, convs: Conv[]): Conv | null {
  if (r.kind === "ai") return convs.find((c) => c.kind === "ai") ?? null;
  if (r.kind === "dm") return convs.find((c) => c.kind === "dm" && (c.other_username ?? "").toLowerCase() === r.key) ?? null;
  if (r.kind === "grup")
    return convs.find((c) => c.id.toLowerCase() === r.key || (c.kind !== "dm" && c.kind !== "ai" && (c.handle ?? "").toLowerCase() === r.key)) ?? null;
  return null;
}
