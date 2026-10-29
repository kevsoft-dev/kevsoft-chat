// Dipakai di server dan client (tanpa import server-only).
export const AI_HANDLE = "kev-ai";
export const COMMUNITY_ID = "00000000-0000-4000-8000-000000000001";

// 3-20 karakter: huruf kecil, angka, _ . -  (tidak boleh diakhiri . atau -)
export const USERNAME_RE = /^[a-z0-9_][a-z0-9_.-]{1,18}[a-z0-9_]$/;
export const RESERVED = ["kev-ai", "kevai", "kev_ai", "admin", "kevsoft", "system", "everyone", "all", "here", "support", "moderator", "api", "sign-in", "signin", "console", "u", "dm", "g", "join", "news", "group", "groups", "health", "robots.txt", "favicon.ico", "static", "assets", "_next", "owner", "staff", "null", "undefined"];

export const mentionRegex = () => /(^|[^a-z0-9_.@-])@([a-z0-9_][a-z0-9_.-]{1,18}[a-z0-9_])/gi;

export function parseMentions(body: string): string[] {
  const set = new Set<string>();
  for (const m of body.matchAll(mentionRegex())) set.add(m[2].toLowerCase());
  return [...set];
}

// Teks setelah tag @kev-ai = keyword/pertanyaan untuk AI.
export function aiPrompt(body: string): string {
  return body
    .replace(/(^|[^a-z0-9_.@-])@kev-ai(?![a-z0-9_-])/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export const LOGO = "https://github.com/kevsoft-dev.png";
