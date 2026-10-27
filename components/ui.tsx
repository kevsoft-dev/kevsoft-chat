import { AI_HANDLE, LOGO, mentionRegex } from "@/lib/mentions";

export type Me = { id: string; username: string; name: string; avatarUrl?: string | null };
export type Conv = {
  id: string; kind: "dm" | "group" | "community" | "ai"; title: string | null; description: string | null;
  other_id: string | null; other_username: string | null; other_name: string | null; other_avatar: string | null;
  member_count: number; last_body: string | null; last_at: string | null; last_kind: string | null;
  last_username: string | null; unread: number; unread_mention: boolean;
};
export type Msg = {
  id: string; conversation_id: string; sender_id: string | null; kind: "user" | "ai"; body: string; created_at: string;
  reply_to: string | null; mentions: string[]; username: string | null; name: string | null; avatar_url: string | null;
  reply_body: string | null; reply_username: string | null;
};
export type UserLite = { id: string; username: string; name: string | null; avatar_url: string | null; role?: string };

export const convName = (c: Conv) => (c.kind === "dm" ? c.other_name || c.other_username || "Pengguna" : c.title || "Grup");
export const hue = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
export const nameColor = (s: string) => `hsl(${hue(s)} 70% var(--name-l, 72%))`;

const P: Record<string, string> = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  send: "m22 2-7 20-4-9-9-4Zm0 0L11 13",
  back: "m15 18-6-6 6-6",
  close: "M18 6 6 18M6 6l12 12",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  reply: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v3",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01",
  check: "M20 6 9 17l-5-5",
  at: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 0c0 1.7 1.3 3 3 3s3-1.3 3-3v-4a9 9 0 1 0-3.5 7.1",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z",
  down: "m6 9 6 6 6-6",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
};
export function Icon({ n, size = 20 }: { n: keyof typeof P; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[n]} />
    </svg>
  );
}

export function Avatar({ name, src, kind, size = 48 }: { name: string; src?: string | null; kind?: string; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (kind === "ai") return <span className="avatar ai" style={style}><Icon n="sparkle" size={size * 0.5} /></span>;
  if (kind === "community" || kind === "group")
    return <span className={`avatar ${kind}`} style={style}><Icon n="users" size={size * 0.48} /></span>;
  if (src) return <img className="avatar" style={style} src={src} alt="" referrerPolicy="no-referrer" />;
  const h = hue(name);
  return (
    <span className="avatar" style={{ ...style, background: `linear-gradient(135deg, hsl(${h} 55% 38%), hsl(${(h + 40) % 360} 60% 28%))` }}>
      {name[0]?.toUpperCase()}
    </span>
  );
}

// Teks pesan: ```kode``` dan @tag (hanya tag valid yang disorot).
export function Rich({ body, mentions, me }: { body: string; mentions: string[]; me: string }) {
  const parts = body.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.length >= 6 && p.startsWith("```") && p.endsWith("```") ? (
          <pre key={i} className="code">{p.slice(3, -3).replace(/^\w*\n/, "").trim()}</pre>
        ) : (
          <Tags key={i} text={p} mentions={mentions} me={me} />
        ),
      )}
    </>
  );
}
function Tags({ text, mentions, me }: { text: string; mentions: string[]; me: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(mentionRegex())) {
    const start = (m.index ?? 0) + m[1].length;
    const handle = m[2].toLowerCase();
    if (!mentions.includes(handle)) continue;
    if (start > last) out.push(text.slice(last, start));
    out.push(<span key={start} className={`tag ${handle === AI_HANDLE ? "ai" : handle === me ? "me" : ""}`}>@{m[2]}</span>);
    last = start + 1 + m[2].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

export const clock = (d: string) => new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
export function dayLabel(d: string) {
  const dt = new Date(d), now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (same(dt, now)) return "Hari ini";
  if (same(dt, y)) return "Kemarin";
  return dt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
export function listTime(d: string) {
  const dt = new Date(d), now = new Date();
  if (dt.toDateString() === now.toDateString()) return clock(d);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dt.toDateString() === y.toDateString()) return "Kemarin";
  return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function Logo({ size = 38 }: { size?: number }) {
  return <img className="brand-logo" src={LOGO} alt="kevsoft" width={size} height={size} style={{ width: size, height: size, borderRadius: size * 0.28 }} />;
}
