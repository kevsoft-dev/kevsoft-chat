"use client";
import { useRef } from "react";
import { AI_HANDLE, LOGO, mentionRegex } from "@/lib/mentions";

export type Me = { id: string; username: string; name: string; avatarUrl?: string | null; bannerUrl?: string | null; bio?: string | null; email?: string | null; role?: string; verified?: boolean; awayEnabled?: boolean; awayMessage?: string | null };
export type Conv = {
  id: string; kind: "dm" | "group" | "community" | "ai"; title: string | null; description: string | null; rules?: string | null; invite_code?: string | null;
  other_id: string | null; other_username: string | null; other_name: string | null; other_avatar: string | null; other_banner?: string | null; other_bio: string | null; other_verified?: boolean; created_by?: string | null; my_group_role?: string | null; handle?: string | null;
  member_count: number; last_body: string | null; last_at: string | null; last_kind: string | null;
  last_username: string | null; last_deleted: boolean; unread: number; unread_mention: boolean;
  disappear_seconds?: number;
};
/** Satu emoji + siapa saja yang memberi reaksi itu (urut dari yang pertama). */
export type Reaction = { e: string; u: { u: string; n: string }[] };
/** Reaksi cepat di bar menu pesan, seperti WhatsApp. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
/** Terapkan reaksi saya ke daftar reaksi (emoji null = hapus). Dipakai untuk update instan sebelum server menjawab. */
export function applyMyReaction(list: Reaction[] | undefined, me: { username: string; name: string }, emoji: string | null): Reaction[] {
  const out: Reaction[] = [];
  for (const r of list || []) {
    const rest = r.u.filter((x) => x.u !== me.username);
    if (rest.length) out.push({ e: r.e, u: rest });
  }
  if (emoji) {
    const i = out.findIndex((r) => r.e === emoji);
    if (i >= 0) out[i] = { ...out[i], u: [...out[i].u, { u: me.username, n: me.name }] };
    else out.push({ e: emoji, u: [{ u: me.username, n: me.name }] });
  }
  return out;
}
export const myReaction = (m: { reactions?: Reaction[] }, username: string) =>
  m.reactions?.find((r) => r.u.some((x) => x.u === username))?.e ?? null;

export type Msg = {
  id: string; conversation_id: string; sender_id: string | null; kind: "user" | "ai"; body: string; created_at: string;
  reply_to: string | null; mentions: string[]; username: string | null; name: string | null; avatar_url: string | null;
  reply_body: string | null; reply_username: string | null; deleted_at: string | null;
  verified?: boolean;
  pinned_at?: string | null;
  has_media?: boolean; media_mime?: string | null; media_name?: string | null;
  poll_data?: { question: string; options: string[]; votes: Record<string, number> } | null;
  reactions?: Reaction[];
  status?: "sending" | "sent" | "failed";
};
export type UserLite = {
  id: string; username: string; name: string | null; avatar_url: string | null; banner_url?: string | null; bio?: string | null;
  verified?: boolean; role?: "owner" | "admin" | "member"; sys_role?: string; group_role?: string; banned?: boolean; muted?: boolean;
};

export const isStaffRole = (r?: string | null) => r === "admin" || r === "owner";
export type RoleLabels = { owner: string; admin: string; user: string };
export const DEFAULT_ROLE_LABELS: RoleLabels = { owner: "Owner", admin: "Admin", user: "Member" };

/** Mahkota king — SVG path, bukan emoji */
function CrownIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="role-ico">
      <path d="M3 18h18v2.5H3V18Zm1.2-3.5L2 7.5l5.2 3.2L12 4l4.8 6.7L22 7.5l-2.2 7H4.2Z" />
    </svg>
  );
}

function ShieldIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="role-ico">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}

export function RoleBadge({ role, title, labels }: {
  role?: string | null; title?: string | null; labels?: Partial<RoleLabels> | null;
}) {
  const L = { ...DEFAULT_ROLE_LABELS, ...labels };
  const text = (title && title.trim()) || (role === "owner" ? L.owner : role === "admin" ? L.admin : null);
  if (!text) return null;

  if (role === "owner") {
    return (
      <em className="badge owner role-badge">
        <CrownIcon />
        <span>{text}</span>
      </em>
    );
  }
  if (role === "admin") {
    return (
      <em className="badge role-badge">
        <ShieldIcon />
        <span>{text}</span>
      </em>
    );
  }
  // role biasa + sebutan kustom
  if (title && title.trim()) {
    return <em className="badge soft role-badge"><span>{text}</span></em>;
  }
  return null;
}

/** Centang biru (verified) — gambar dari /public/verified.png */
export function VerifiedBadge({ title = "Terverifikasi" }: { title?: string }) {
  return <img className="vbadge" src="/verified.png" alt="Terverifikasi" title={title} width={16} height={16} draggable={false} />;
}

export const convName = (c: Conv) => (c.kind === "dm" ? c.other_name || c.other_username || "Pengguna" : c.title || "Grup");
export const hue = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
export const nameColor = (s: string) => `hsl(${hue(s)} 70% var(--name-l, 72%))`;

const P: Record<string, string> = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  send: "m22 2-7 20-4-9-9-4Zm0 0L11 13",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  back: "m15 18-6-6 6-6",
  close: "M18 6 6 18M6 6l12 12",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  reply: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v3",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01",
  check: "M20 6 9 17l-5-5",
  checks: "M4 12.5 7.5 16 14 8M11 16l1.5 1.5L20 8",
  at: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 0c0 1.7 1.3 3 3 3s3-1.3 3-3v-4a9 9 0 1 0-3.5 7.1",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z",
  down: "m6 9 6 6 6-6",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  more: "M12 5h.01M12 12h.01M12 19h.01",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5",
  copy: "M9 9h11v11H9ZM5 15V4h11",
  camera: "M3 8h4l2-3h6l2 3h4v12H3ZM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  logout: "M9 21H5V3h4M16 17l5-5-5-5M21 12H9",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2",
  alert: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 8v5M12 16h.01",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9Z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  block: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM5 5l14 14",
  keyboard: "M3 6h18v12H3ZM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  key: "M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3",
  mute: "M11 5 6 9H2v6h4l5 4ZM22 9l-6 6M16 9l6 6",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z",
  share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14",
  play: "M6 4l14 8-14 8Z",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  news: "M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2ZM19 8h2v10a2 2 0 0 1-2 2M8 8h7M8 12h7M8 16h4",
  image: "M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm0 10 4-4 3 3 5-6 4 5",
  file: "M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Zm0 0v6h6M9 13h6M9 17h6",
  poll: "M4 19V9M10 19V5M16 19v-7M22 19V11",
  paperclip: "m21.4 11.6-8.8 8.8a5 5 0 0 1-7.1-7.1l9.2-9.2a3.2 3.2 0 0 1 4.5 4.5l-9.2 9.2a1.4 1.4 0 0 1-2-2l8.1-8.1",
};
export type IconName = keyof typeof P;
export function Icon({ n, size = 20 }: { n: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[n]} />
    </svg>
  );
}

/** Foto sampul (banner) di belakang foto profil. Tanpa foto: gradasi warna dari nama. */
export function Banner({ name, src, children, className = "" }: { name: string; src?: string | null; children?: React.ReactNode; className?: string }) {
  const h = hue(name);
  const bg = src ? undefined : { background: `linear-gradient(120deg, hsl(${h} 55% 34%), hsl(${(h + 55) % 360} 60% 24%))` };
  return (
    <div className={`banner${src ? " has" : ""} ${className}`.trim()} style={bg}>
      {src && <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} />}
      {children}
    </div>
  );
}

export function Avatar({ name, src, kind, size = 48 }: { name: string; src?: string | null; kind?: string; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (kind === "ai") return <span className="avatar ai" style={style}><Icon n="sparkle" size={size * 0.5} /></span>;
  if (src) return <img className="avatar" style={style} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
  if (kind === "community" || kind === "group")
    return <span className={`avatar ${kind}`} style={style}><Icon n="users" size={size * 0.48} /></span>;
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
    if (handle === AI_HANDLE || handle === me) {
      out.push(<span key={start} className={`tag ${handle === AI_HANDLE ? "ai" : "me"}`}>@{m[2]}</span>);
    } else {
      out.push(<a key={start} className="tag" href={`/${encodeURIComponent(m[2].toLowerCase())}`}>@{m[2]}</a>);
    }
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

// Tekan lama (HP) atau klik kanan (desktop) untuk membuka menu. wasLong() mencegah klik ikutan setelah tekan lama.
export function useLongPress(cb: (x: number, y: number) => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fired = useRef(false);
  const lastFire = useRef(0);
  const start = useRef({ x: 0, y: 0 });
  const stop = () => clearTimeout(timer.current);
  const fire = (x: number, y: number) => { fired.current = true; lastFire.current = performance.now(); cb(x, y); };
  const bind = {
    onTouchStart: (e: React.TouchEvent) => {
      fired.current = false;
      const p = e.touches[0];
      start.current = { x: p.clientX, y: p.clientY };
      timer.current = setTimeout(() => { navigator.vibrate?.(8); fire(start.current.x, start.current.y); }, ms);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const p = e.touches[0];
      if (Math.abs(p.clientX - start.current.x) + Math.abs(p.clientY - start.current.y) > 10) stop();
    },
    onTouchEnd: stop,
    onTouchCancel: stop,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault(); stop();
      if (performance.now() - lastFire.current < 900) return; // Android memicu contextmenu setelah tekan lama
      fire(e.clientX, e.clientY);
    },
  };
  return { bind, wasLong: () => { const f = fired.current; fired.current = false; return f; } };
}
