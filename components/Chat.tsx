"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Pusher from "pusher-js";
import { AI_HANDLE, parseMentions } from "@/lib/mentions";
import { readPref } from "@/lib/prefs";
import { blip, unlockAudio } from "@/lib/sound";
import Composer from "./Composer";
import Console from "./Console";
import ConvItem from "./ConvItem";
import MessageRow from "./MessageRow";
import NewChat from "./NewChat";
import Profile from "./Profile";
import { Dialog, Lightbox, Menu, type DialogAction, type MenuItem } from "./overlays";
import { Avatar, Banner, Icon, Logo, RoleBadge, VerifiedBadge, DEFAULT_ROLE_LABELS, convName, isStaffRole, type Conv, type Me, type Msg, type UserLite, type RoleLabels } from "./ui";

type MenuState = { x: number; y: number; items: MenuItem[] };
type DialogState = { title: string; text?: string; actions: DialogAction[] };

const post = (url: string, body: object) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); });

const placeMenu = (x: number, y: number, n: number) => ({
  x: Math.max(8, Math.min(x, window.innerWidth - 228)),
  y: Math.max(8, Math.min(y, window.innerHeight - (n * 46 + 20))),
});

// Pesan yang belum terkonfirmasi server (mengirim / gagal) dipertahankan saat daftar dimuat ulang.
const mergePending = (list: Msg[], cur: Msg[]) => {
  const pend = cur.filter((m) => (m.status === "sending" || m.status === "failed") && !list.some((x) => x.id === m.id));
  return pend.length ? [...list, ...pend] : list;
};

async function fetchMsgs(id: string): Promise<Msg[] | null> {
  try {
    const r = await fetch(`/api/messages?conversationId=${id}`, { cache: "no-store" });
    if (r.status === 401) { window.location.assign("/sign-in"); return null; }
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export default function Chat({ me: me0, pusherKey, pusherCluster, openDm, openId }: { me: Me; pusherKey: string; pusherCluster: string; openDm?: string; openId?: string }) {
  const [me, setMe] = useState<Me>(me0);
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "dm" | "group">("all");
  const [showNew, setShowNew] = useState(false);
  const [profile, setProfile] = useState(false);
  const [info, setInfo] = useState(false);
  const [members, setMembers] = useState<UserLite[]>([]);
  const [aiWait, setAiWait] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<string[]>([]);
  const [leavingMsgs, setLeavingMsgs] = useState<string[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [toastText, setToastText] = useState("");
  const [away, setAway] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const [showConsole, setShowConsole] = useState(false);
  const [memberQ, setMemberQ] = useState("");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [addQ, setAddQ] = useState("");
  const [addHits, setAddHits] = useState<{ id: string; username: string; name: string | null; avatar_url: string | null }[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [viewUser, setViewUser] = useState<UserLite | null>(null);
  const [roleLabels, setRoleLabels] = useState<RoleLabels>(DEFAULT_ROLE_LABELS);

  const meRef = useRef(me); meRef.current = me;
  const activeRef = useRef<string | null>(null);
  const convsRef = useRef<Conv[] | null>(null); convsRef.current = convs;
  const msgsRef = useRef<Msg[]>([]); msgsRef.current = msgs;
  const replyRef = useRef<Msg | null>(null); replyRef.current = replyTo;
  const cache = useRef<Record<string, Msg[]>>({});
  const fresh = useRef(new Set<string>());
  const thread = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const positioned = useRef<string | null>(null);
  const prevLast = useRef<string | undefined>(undefined);
  const pendingPrepend = useRef<number | null>(null);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const active = useMemo(() => convs?.find((c) => c.id === activeId) ?? null, [convs, activeId]);

  const toast = useCallback((t: string) => {
    setToastText(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(""), 2200);
  }, []);

  // ---------- daftar chat ----------
  const loadConvs = useCallback(async () => {
    try {
      const r = await fetch("/api/conversations");
      if (r.status === 401) { window.location.assign("/sign-in"); return; }
      if (r.ok) setConvs(await r.json());
    } catch {}
  }, []);
  // Muat ulang daftar dengan jeda singkat supaya beberapa event beruntun hanya memicu satu query.
  const scheduleConvs = useCallback(() => {
    clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(loadConvs, 250);
  }, [loadConvs]);

  // Perbarui satu baris daftar secara lokal (tanpa query ke server).
  const bump = useCallback((m: Msg, incoming: boolean, isActive: boolean) => {
    if (!convsRef.current?.some((c) => c.id === m.conversation_id)) { scheduleConvs(); return; }
    setConvs((list) => {
      if (!list) return list;
      const i = list.findIndex((c) => c.id === m.conversation_id);
      if (i < 0) return list;
      const c = list[i];
      const hot = incoming && !isActive;
      const next: Conv = {
        ...c, last_body: m.body, last_at: m.created_at, last_kind: m.kind, last_username: m.username, last_deleted: false,
        unread: hot ? c.unread + 1 : c.unread,
        unread_mention: c.unread_mention || (hot && m.mentions.includes(meRef.current.username.toLowerCase())),
      };
      const rest = list.filter((_, j) => j !== i);
      const k = next.kind === "ai" ? 0 : rest[0]?.kind === "ai" ? 1 : 0;
      return [...rest.slice(0, k), next, ...rest.slice(k)];
    });
  }, [scheduleConvs]);

  const markRead = useCallback((cid: string) => {
    setConvs((l) => l && l.map((c) => (c.id === cid && (c.unread || c.unread_mention) ? { ...c, unread: 0, unread_mention: false } : c)));
    post("/api/read", { conversationId: cid }).catch(() => {});
  }, []);

  const mutate = useCallback((cid: string, fn: (x: Msg[]) => Msg[]) => {
    if (cid === activeRef.current) setMsgs(fn);
    if (cache.current[cid]) cache.current[cid] = fn(cache.current[cid]);
  }, []);

  const closeChat = useCallback(() => {
    const id = activeRef.current;
    if (id) cache.current[id] = msgsRef.current;
    activeRef.current = null; setActiveId(null); setInfo(false); setReplyTo(null);
  }, []);

  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setRoleLabels({ owner: d.owner || "Owner", admin: d.admin || "Admin", user: d.user || "Member" });
    }).catch(() => {});
  }, []);

  // ---------- realtime ----------
  useEffect(() => {
    loadConvs();
    const pusher = new Pusher(pusherKey, {
      cluster: pusherCluster,
      channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
    });
    const ch = pusher.subscribe(`private-user-${me0.id}`);

    ch.bind("message", (m: Msg) => {
      const cid = m.conversation_id;
      const mineMsg = m.sender_id === meRef.current.id;
      const isActive = cid === activeRef.current;
      if (m.kind === "ai") setAiWait((w) => w.filter((x) => x !== cid));
      const cached = cache.current[cid];
      if (cached && !cached.some((y) => y.id === m.id)) cache.current[cid] = [...cached, m];
      if (isActive) {
        setMsgs((x) => {
          const i = x.findIndex((y) => y.id === m.id);
          if (i >= 0) { const c = x.slice(); c[i] = { ...m, status: mineMsg ? "sent" : undefined }; return c; }
          fresh.current.add(m.id);
          return [...x, m];
        });
        if (!mineMsg) markRead(cid);
      }
      bump(m, !mineMsg, isActive);
      if (!mineMsg && readPref("sound", true) && (document.hidden || !isActive)) blip("in");
    });

    ch.bind("delete", (d: { id: string; conversation_id: string }) => {
      mutate(d.conversation_id, (x) => x.map((y) =>
        y.id === d.id ? { ...y, body: "", mentions: [], deleted_at: new Date().toISOString() } : y.reply_to === d.id ? { ...y, reply_body: "" } : y));
      scheduleConvs();
    });
    ch.bind("remove", (d: { id: string; conversation_id: string }) => {
      mutate(d.conversation_id, (x) => x.filter((y) => y.id !== d.id));
      scheduleConvs();
    });
    ch.bind("pin", (d: { id: string; conversation_id: string; pinned?: boolean }) => {
      mutate(d.conversation_id, (x) => x.map((y) => y.id === d.id ? { ...y, pinned_at: d.pinned ? new Date().toISOString() : null } : y));
    });

    ch.bind("conversation", (d?: { id?: string; title?: string; description?: string | null; rules?: string | null; avatar_url?: string | null; handle?: string | null; cleared?: boolean; destroyed?: boolean }) => {
      scheduleConvs();
      if (d?.destroyed && d.id && activeRef.current === d.id) {
        activeRef.current = null; setActiveId(null); setMsgs([]); setInfo(false);
      } else if (d?.cleared && d.id && activeRef.current === d.id) {
        setMsgs([]); if (cache.current[d.id]) cache.current[d.id] = [];
      }
      if (d?.id && (d.title !== undefined || d.avatar_url !== undefined || d.description !== undefined || d.rules !== undefined || d.handle !== undefined)) {
        setConvs((list) => (list ?? []).map((c) => c.id === d.id ? {
          ...c,
          title: d.title !== undefined ? d.title : c.title,
          description: d.description !== undefined ? d.description : c.description,
          rules: d.rules !== undefined ? d.rules : c.rules,
          other_avatar: d.avatar_url !== undefined ? d.avatar_url : c.other_avatar,
          handle: d.handle !== undefined ? d.handle : c.handle,
        } : c));
      }
    });
    ch.bind("disappear", (d: { conversationId?: string; seconds?: number }) => {
      if (!d?.conversationId || typeof d.seconds !== "number") return;
      setConvs((list) => (list ?? []).map((c) => (c.id === d.conversationId ? { ...c, disappear_seconds: d.seconds } : c)));
    });

    // Moderasi: akun diblokir -> langsung keluar; dibisukan -> pemberitahuan; role berubah -> perbarui menu.
    ch.bind("banned", async () => {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      window.location.assign("/sign-in");
    });
    ch.bind("muted", () => toast("Kamu dibisukan oleh moderator"));
    ch.bind("news_mention", (d: { title?: string; from?: string; reply?: boolean }) =>
      toast(d?.reply ? `@${d.from} membalas komentarmu di berita` : `@${d?.from} menyebut kamu di komentar berita`));
    ch.bind("role", (d: { role?: string; verified?: boolean }) => { if (d?.role) setMe((x) => ({ ...x, role: d.role, ...(typeof d.verified === "boolean" ? { verified: d.verified } : {}) })); });

    let first = true; // setelah tersambung ulang, ambil pesan yang mungkin terlewat
    pusher.connection.bind("connected", () => {
      if (first) { first = false; return; }
      scheduleConvs();
      const id = activeRef.current;
      if (id) fetchMsgs(id).then((l) => { if (l && activeRef.current === id) setMsgs((p) => mergePending(l, p)); });
    });

    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    if (!readPref("motion", true)) document.documentElement.dataset.motion = "off";
    return () => { pusher.disconnect(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, [me0.id, pusherKey, pusherCluster, loadConvs, scheduleConvs, bump, markRead, mutate, toast]);

  // Fallback sinkron: polling ringan + refetch saat tab fokusus/visible
  // Supaya pesan masuk tetap muncul meski event Pusher terlewat (tanpa harus keluar-masuk chat).
  useEffect(() => {
    if (!activeId) return;

    const syncActive = async () => {
      const id = activeRef.current;
      if (!id || document.visibilityState === "hidden") return;
      try {
        const list = await fetchMsgs(id);
        if (!list || activeRef.current !== id) return;
        setMsgs((prev) => {
          const merged = mergePending(list, prev);
          // Deteksi pesan baru dari orang lain untuk update sidebar + suara
          const known = new Set(prev.map((m) => m.id));
          for (const m of list) {
            if (known.has(m.id)) continue;
            if (m.sender_id === meRef.current.id) continue;
            if (m.kind === "ai") setAiWait((w) => w.filter((x) => x !== id));
            bump(m, true, true);
            if (readPref("sound", true) && document.hidden) blip("in");
          }
          // update cache
          cache.current[id] = merged;
          return merged;
        });
      } catch {}
    };

    // Poll tiap 2.5 dtk saat chat terbuka (tab terlihat)
    const tick = setInterval(syncActive, 2500);
    // Langsung sinkron saat kembali ke tab / fokusus window
    const onVis = () => { if (document.visibilityState === "visible") syncActive(); };
    const onFocus = () => syncActive();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [activeId, bump]);

  useEffect(() => {
    const onVote = async (e: Event) => {
      const { id, option } = (e as CustomEvent).detail || {};
      if (!id || option == null) return;
      try {
        const r = await fetch("/api/messages", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action: "vote", option }),
        });
        if (!r.ok) toast("Gagal vote");
      } catch { toast("Gagal vote"); }
    };
    window.addEventListener("poll-vote", onVote);
    return () => window.removeEventListener("poll-vote", onVote);
  }, [toast]);


  const totalUnread = (convs ?? []).reduce((n, c) => n + c.unread, 0);
  useEffect(() => { document.title = totalUnread ? `(${totalUnread}) kevsoft-chat` : "kevsoft-chat"; }, [totalUnread]);

  // Chat yang dibuka hilang dari daftar (mis. dihapus dari perangkat lain) -> kembali ke daftar.
  useEffect(() => { if (activeId && convs && !active) closeChat(); }, [activeId, convs, active, closeChat]);

  // ---------- buka chat ----------
  const open = useCallback(async (id: string) => {
    const prev = activeRef.current;
    if (prev) cache.current[prev] = msgsRef.current;
    const keys = Object.keys(cache.current);
    if (keys.length > 12) delete cache.current[keys[0]];
    activeRef.current = id; setActiveId(id); fresh.current.clear();
    positioned.current = null; stick.current = true; setAway(false); setNewBelow(0); setNoMore(false);
    setReplyTo(null); setInfo(false); setMembers([]); setMenu(null); setViewUser(null); setAddMemberOpen(false); setRulesOpen(false); setAddQ(""); setAddHits([]);
    const cached = cache.current[id];
    setMsgs(cached ?? []); setLoading(!cached);
    setConvs((l) => l && l.map((c) => (c.id === id ? { ...c, unread: 0, unread_mention: false } : c)));
    const list = await fetchMsgs(id); // GET sekaligus menandai sudah dibaca di server
    if (activeRef.current !== id) return;
    setLoading(false);
    if (list) setMsgs((p) => mergePending(list, p));
  }, []);

  const openById = useCallback(async (id: string) => {
    setShowNew(false);
    try {
      const r = await fetch("/api/conversations");
      if (!r.ok) return;
      setConvs(await r.json());
      open(id);
    } catch {}
  }, [open]);

  const openDmWith = useCallback(async (username: string) => {
    setViewUser(null);
    setInfo(false);
    try {
      const r = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "dm", username: username.toLowerCase() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || "Gagal membuka chat"); return; }
      if (d.id) await openById(d.id);
    } catch { toast("Jaringan bermasalah"); }
  }, [openById, toast]);

  // Deep link: buka chat by id (server sudah siapkan) atau by username
  const dmOpened = useRef(false);
  useEffect(() => {
    if (dmOpened.current) return;
    if (openId) {
      dmOpened.current = true;
      const t = setTimeout(() => { openById(openId); }, 30);
      return () => clearTimeout(t);
    }
    if (!openDm) return;
    const target = openDm.replace(/^@/, "").toLowerCase().trim();
    if (!target || target === me0.username.toLowerCase()) return;
    dmOpened.current = true;
    const t = setTimeout(() => { openDmWith(target); }, 50);
    return () => clearTimeout(t);
  }, [openId, openDm, openById, openDmWith, me0.username]);

  async function copyText(text: string, okMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg);
    } catch { toast("Gagal menyalin"); }
  }

  function saveContact(u: { username: string; name?: string | null; bio?: string | null }) {
    // Simpan sebagai teks kontak (vCard ringan) ke clipboard — HP bisa paste ke kontak.
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${u.name || u.username}`,
      `N:${u.name || u.username};;;;`,
      `NICKNAME:${u.username}`,
      u.bio ? `NOTE:${u.bio.replace(/\n/g, "\\n")}` : "",
      `URL:https://kevsoft-chat.vercel.app`,
      "END:VCARD",
    ].filter(Boolean).join("\n");
    copyText(lines, "Kontak disalin (vCard) — tempel di aplikasi Kontak");
  }

  async function older() {
    const id = activeRef.current;
    if (!id || msgs.length === 0) return;
    try {
      const r = await fetch(`/api/messages?conversationId=${id}&before=${encodeURIComponent(msgs[0].created_at)}`);
      if (!r.ok || activeRef.current !== id) return;
      const more: Msg[] = await r.json();
      if (more.length < 50) setNoMore(true);
      if (more.length) { pendingPrepend.current = thread.current?.scrollHeight ?? null; setMsgs((x) => [...more, ...x]); }
    } catch {}
  }

  // ---------- scroll ----------
  const onScroll = useCallback(() => {
    const el = thread.current; if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    stick.current = near;
    setAway(!near);
    if (near) setNewBelow(0);
  }, []);
  const toBottom = useCallback(() => {
    const el = thread.current; if (!el) return;
    stick.current = true; setNewBelow(0);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const waiting = !!activeId && aiWait.includes(activeId);
  const lastId = msgs[msgs.length - 1]?.id;
  const firstId = msgs[0]?.id;
  useLayoutEffect(() => {
    const el = thread.current;
    if (el && pendingPrepend.current != null) { el.scrollTop += el.scrollHeight - pendingPrepend.current; pendingPrepend.current = null; }
  }, [firstId]);
  useLayoutEffect(() => {
    const el = thread.current; if (!el || !activeId) return;
    if (positioned.current !== activeId) {
      if (!loading) { el.scrollTop = el.scrollHeight; positioned.current = activeId; prevLast.current = lastId; }
      return;
    }
    const last = msgs[msgs.length - 1];
    const changed = prevLast.current !== lastId; prevLast.current = lastId;
    const mineLast = !!last && last.sender_id === meRef.current.id;
    if (stick.current || (changed && mineLast)) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else if (changed && last) setNewBelow((n) => n + 1);
  }, [lastId, loading, waiting, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Papan ketik HP muncul / ukuran berubah: tetap di bawah kalau sedang di bawah.
  useEffect(() => {
    const el = thread.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (stick.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeId]);

  // ---------- kirim pesan (optimistik: langsung tampil, server menyusul) ----------
  const deliver = useCallback(async (m: Msg) => {
    const patch = (p: Partial<Msg>) => mutate(m.conversation_id, (x) => x.map((y) => (y.id === m.id ? { ...y, ...p } : y)));
    try {
      const r = await post("/api/messages", { id: m.id, conversationId: m.conversation_id, body: m.body, replyTo: m.reply_to ?? undefined });
      if (r.status === 401) { window.location.assign("/sign-in"); return; }
      if (r.status === 403) { const d = await r.json().catch(() => null); toast(d?.error || "Pesan tidak terkirim"); }
      if (!r.ok) throw new Error(String(r.status));
      const s = await r.json();
      patch({ status: "sent", created_at: s.created_at, mentions: s.mentions });
    } catch {
      patch({ status: "failed" });
      setAiWait((w) => w.filter((x) => x !== m.conversation_id));
    }
  }, [mutate, toast]);

  const retry = useCallback((m: Msg) => {
    mutate(m.conversation_id, (x) => x.map((y) => (y.id === m.id ? { ...y, status: "sending" } : y)));
    deliver({ ...m, status: "sending" });
  }, [deliver, mutate]);

  useEffect(() => {
    const back = () => msgsRef.current.filter((m) => m.status === "failed").forEach(retry);
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [retry]);

  const send = useCallback((body: string) => {
    const cid = activeRef.current; if (!cid) return;
    const kind = convsRef.current?.find((c) => c.id === cid)?.kind;
    const rt = replyRef.current;
    const mm = meRef.current;
    const m: Msg = {
      id: newId(), conversation_id: cid, sender_id: mm.id, kind: "user", body, created_at: new Date().toISOString(),
      reply_to: rt?.id ?? null, mentions: parseMentions(body), username: mm.username, name: mm.name, avatar_url: mm.avatarUrl ?? null, verified: !!mm.verified,
      reply_body: rt ? (rt.deleted_at ? "" : rt.body.slice(0, 140)) : null, reply_username: rt ? rt.username : null,
      deleted_at: null, status: "sending",
    };
    fresh.current.add(m.id); stick.current = true;
    setMsgs((x) => [...x, m]);
    setReplyTo(null);
    bump(m, false, true);
    if (kind === "ai" || m.mentions.includes(AI_HANDLE)) {
      setAiWait((w) => (w.includes(cid) ? w : [...w, cid]));
      // timeout selaras dengan batas AI server (~22s) + buffer
      setTimeout(() => setAiWait((w) => w.filter((x) => x !== cid)), 28_000);
    }
    if (readPref("sound", true)) blip("out");
    deliver(m);
  }, [bump, deliver]);

  // ---------- hapus pesan ----------
  const deleteMsg = useCallback(async (m: Msg, scope: "me" | "all" | "silent") => {
    const cid = m.conversation_id;
    if (scope === "all") {
      mutate(cid, (x) => x.map((y) =>
        y.id === m.id ? { ...y, body: "", mentions: [], deleted_at: new Date().toISOString() } : y.reply_to === m.id ? { ...y, reply_body: "" } : y));
    } else {
      setLeavingMsgs((l) => [...l, m.id]);
      setTimeout(() => { mutate(cid, (x) => x.filter((y) => y.id !== m.id)); setLeavingMsgs((l) => l.filter((i) => i !== m.id)); }, 200);
    }
    try {
      const r = await fetch(`/api/messages?id=${m.id}&scope=${scope}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      scheduleConvs();
    } catch {
      toast("Gagal menghapus pesan");
      const list = await fetchMsgs(cid);
      if (list && activeRef.current === cid) setMsgs((p) => mergePending(list, p));
    }
  }, [mutate, scheduleConvs, toast]);

  const askDelete = useCallback((m: Msg) => {
    if (m.status === "failed") { // belum sampai ke server: cukup buang dari layar
      setLeavingMsgs((l) => [...l, m.id]);
      setTimeout(() => { mutate(m.conversation_id, (x) => x.filter((y) => y.id !== m.id)); setLeavingMsgs((l) => l.filter((i) => i !== m.id)); }, 200);
      return;
    }
    const mine = m.sender_id === meRef.current.id && !m.deleted_at;
    const actions: DialogAction[] = [];
    const mod = isStaffRole(meRef.current.role) && !mine && !m.deleted_at;
    if (mine) actions.push({ label: "Hapus untuk semua orang", danger: true, run: () => deleteMsg(m, "all") });
    if (mod) actions.push({ label: "Hapus untuk semua (moderator)", danger: true, run: () => deleteMsg(m, "all") });
    actions.push({ label: m.pinned_at ? "Lepas sematan" : "Sematkan pesan", run: async () => {
      try {
        await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: m.id, action: m.pinned_at ? "unpin" : "pin" }) });
      } catch {}
    } });
    if (isStaffRole(me.role)) actions.push({ label: "Hapus diam-diam (staf)", danger: true, run: () => deleteMsg(m, "silent") });
    actions.push({ label: "Hapus untuk saya", danger: !mine && !mod, run: () => deleteMsg(m, "me") });
    setDialog({ title: "Hapus pesan?", text: mine ? "Hapus untuk semua orang akan menghilangkan pesan ini dari semua anggota percakapan." : mod ? "Sebagai moderator kamu bisa menghapus pesan ini untuk semua anggota. Tindakan ini dicatat di Log." : undefined, actions });
  }, [deleteMsg, mutate]);

  const copyMsg = useCallback(async (m: Msg) => {
    try { await navigator.clipboard.writeText(m.body); toast("Pesan disalin"); } catch { toast("Gagal menyalin"); }
  }, [toast]);

  const openMsgMenu = useCallback((m: Msg, x: number, y: number) => {
    const items: MenuItem[] = [];
    const ok = !m.deleted_at && m.status !== "failed";
    if (m.status === "failed") items.push({ icon: "send", label: "Kirim ulang", run: () => retry(m) });
    if (ok) items.push({ icon: "reply", label: "Balas", run: () => { setReplyTo(m); taRef.current?.focus(); } });
    if (!m.deleted_at) items.push({ icon: "copy", label: "Salin", run: () => copyMsg(m) });
    items.push({ icon: "trash", label: "Hapus", danger: true, run: () => askDelete(m) });
    setMenu({ ...placeMenu(x, y, items.length), items });
  }, [retry, copyMsg, askDelete]);

  // ---------- hapus / bersihkan chat ----------
  const runConvDelete = useCallback(async (c: Conv, mode: "clear" | "delete") => {
    try {
      const r = await fetch(`/api/conversations?id=${c.id}&mode=${mode}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    } catch { toast("Gagal menghapus chat"); return; }
    delete cache.current[c.id];
    if (mode === "delete" && (c.kind === "dm" || c.kind === "group")) {
      setLeaving((l) => [...l, c.id]);
      setTimeout(() => {
        setConvs((l) => l && l.filter((x) => x.id !== c.id));
        setLeaving((l) => l.filter((x) => x !== c.id));
        if (activeRef.current === c.id) closeChat();
      }, 230);
      toast(c.kind === "group" ? "Kamu keluar dari grup" : "Chat dihapus");
    } else {
      setConvs((l) => l && l.map((x) => (x.id === c.id
        ? { ...x, last_body: null, last_at: null, last_kind: null, last_username: null, last_deleted: false, unread: 0, unread_mention: false } : x)));
      if (activeRef.current === c.id) setMsgs([]);
      toast("Chat dibersihkan");
    }
  }, [closeChat, toast]);

  const askConv = useCallback((c: Conv, mode: "clear" | "delete") => {
    const name = convName(c);
    if (mode === "clear")
      setDialog({ title: "Bersihkan chat?", text: "Semua pesan di chat ini dihapus dari akunmu. Orang lain tetap melihat pesannya.",
        actions: [{ label: "Bersihkan chat", danger: true, run: () => runConvDelete(c, "clear") }] });
    else if (c.kind === "group")
      setDialog({ title: `Keluar dari “${name}”?`, text: "Kamu tidak akan menerima pesan grup ini lagi.",
        actions: [{ label: "Keluar grup", danger: true, run: () => runConvDelete(c, "delete") }] });
    else
      setDialog({ title: `Hapus chat dengan ${name}?`, text: "Riwayat pesan dihapus dari akunmu. Chat muncul lagi kalau ada pesan baru.",
        actions: [{ label: "Hapus chat", danger: true, run: () => runConvDelete(c, "delete") }] });
  }, [runConvDelete]);

  const convItems = useCallback((c: Conv): MenuItem[] => {
    const items: MenuItem[] = [{ icon: "trash", label: "Bersihkan chat", run: () => askConv(c, "clear") }];
    if (c.kind === "dm") items.push({ icon: "trash", label: "Hapus chat", danger: true, run: () => askConv(c, "delete") });
    if (c.kind === "group") items.push({ icon: "logout", label: "Keluar grup", danger: true, run: () => askConv(c, "delete") });
    return items;
  }, [askConv]);

  const openConvMenu = useCallback((c: Conv, x: number, y: number) => {
    const items = convItems(c);
    setMenu({ ...placeMenu(x, y, items.length), items });
  }, [convItems]);

  const loadMembers = useCallback(async (cid: string) => {
    try { const r = await fetch(`/api/members?conversationId=${cid}`); if (r.ok && activeRef.current === cid) setMembers(await r.json()); } catch {}
  }, []);

  async function showInfo() {
    if (!active) return;
    setInfo(true); setMemberQ(""); setViewUser(null);
    if (active.kind === "group" || active.kind === "community") loadMembers(active.id);
  }

  // ---------- moderasi anggota (menu titik tiga di panel Info) ----------
  const rk = (r?: string | null) => (r === "owner" ? 2 : r === "admin" ? 1 : 0);
  const myRank = rk(me.role);

  const adminAct = useCallback(async (body: object, okText: string) => {
    const r = await post("/api/admin/users", body);
    const d = await r.json().catch(() => ({}));
    toast(r.ok ? okText : d.error || "Gagal");
    if (r.ok && activeRef.current) loadMembers(activeRef.current);
  }, [toast, loadMembers]);

  const kickMember = useCallback(async (cid: string, u: UserLite) => {
    try {
      const r = await fetch(`/api/members?conversationId=${cid}&userId=${encodeURIComponent(u.id)}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || "Gagal mengeluarkan"); return; }
      toast(`@${u.username} dikeluarkan`);
      loadMembers(cid); scheduleConvs();
    } catch { toast("Jaringan bermasalah, coba lagi"); }
  }, [toast, loadMembers, scheduleConvs]);

  const searchAddMembers = useCallback(async (q: string, cid: string) => {
    const s = q.trim().replace(/^@/, "").toLowerCase();
    setAddQ(q);
    if (s.length < 1) { setAddHits([]); return; }
    try {
      const r = await fetch(`/api/users?q=${encodeURIComponent(s)}`);
      if (!r.ok) return;
      const list = await r.json();
      // sembunyikan yang sudah anggota
      const inGroup = new Set(members.map((m) => m.id));
      setAddHits((list as any[]).filter((u) => !inGroup.has(u.id)).slice(0, 8));
    } catch { setAddHits([]); }
  }, [members]);

  const addMembersToGroup = useCallback(async (cid: string, usernames: string[]) => {
    if (!usernames.length || addBusy) return;
    setAddBusy(true);
    try {
      const r = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: cid, usernames }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || "Gagal menambah anggota"); return; }
      const n = (d.added as string[] | undefined)?.length || 0;
      toast(n === 1 ? `@${d.added[0]} ditambahkan` : `${n} anggota ditambahkan`);
      setAddQ(""); setAddHits([]); setAddMemberOpen(false);
      loadMembers(cid); scheduleConvs();
    } catch { toast("Jaringan bermasalah"); }
    finally { setAddBusy(false); }
  }, [addBusy, toast, loadMembers, scheduleConvs]);

  const muteInGroup = useCallback(async (cid: string, u: UserLite, action: "mute" | "unmute", minutes = 60) => {
    try {
      const r = await fetch("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: cid, userId: u.id, action, minutes }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || "Gagal"); return; }
      toast(action === "mute" ? `@${u.username} dibisukan di grup` : `@${u.username} bisa kirim pesan lagi`);
      loadMembers(cid);
    } catch { toast("Jaringan bermasalah"); }
  }, [toast, loadMembers]);

  const memberItems = useCallback((u: UserLite, c: Conv, all: UserLite[]): MenuItem[] => {
    if (u.id === me.id || (c.kind !== "group" && c.kind !== "community")) return [];
    const tr = rk(u.sys_role);
    const staffCan = myRank === 2 ? tr < 2 : myRank === 1 ? tr === 0 : false;
    const myG = all.find((x) => x.id === me.id)?.group_role || "";
    const theirG = u.group_role || "member";
    // Owner grup: kick admin/member. Admin grup: kick member biasa (bukan staf sistem).
    const groupOwnerCan = c.kind === "group" && myG === "owner" && theirG !== "owner";
    const groupAdminCan = c.kind === "group" && myG === "admin" && theirG === "member" && tr === 0;
    if (!staffCan && !groupOwnerCan && !groupAdminCan) return [];
    const where = c.kind === "group" ? "grup" : "Komunitas";
    const confirm = (title: string, text: string, label: string, run: () => void, danger = true) =>
      setDialog({ title, text, actions: [{ label, danger, run }] });
    const items: MenuItem[] = [
      { icon: "logout", label: `Keluarkan dari ${where}`, danger: true,
        run: () => confirm(`Keluarkan @${u.username}?`, `Dikeluarkan dari ${c.kind === "group" ? `“${convName(c)}”` : "Komunitas Kevsoft"}.`, "Kick", () => kickMember(c.id, u)) },
    ];
    if (c.kind === "group" && (groupOwnerCan || groupAdminCan || staffCan)) {
      const isGMuted = !!(u as any).group_muted;
      items.push({
        icon: "mute",
        label: isGMuted ? "Buka bisu di grup" : "Bisukan di grup (1 jam)",
        run: () => muteInGroup(c.id, u, isGMuted ? "unmute" : "mute"),
      });
      if (!isGMuted) {
        items.push({
          icon: "mute",
          label: "Bisukan di grup (24 jam)",
          run: () => muteInGroup(c.id, u, "mute", 24 * 60),
        });
      }
    }
    if (staffCan) {
      items.push({ icon: "block", label: "Blokir akun (ban)", danger: true,
        run: () => confirm(`Blokir @${u.username}?`, "Akun langsung keluar dan tidak bisa masuk lagi sampai blokir dibuka di Console.", "Blokir akun", () => adminAct({ action: "ban", userId: u.id, reason: "Melanggar aturan komunitas" }, "Akun diblokir")) });
      items.push({ icon: "mute", label: "Bisukan global 1 jam", run: () => adminAct({ action: "mute", userId: u.id, minutes: 60 }, "Pengguna dibisukan 1 jam") });
      if (myRank === 2) {
        items.push({ icon: "check", label: u.verified ? "Cabut centang biru" : "Beri centang biru",
          run: () => adminAct({ action: "verify", userId: u.id, verified: !u.verified }, u.verified ? "Centang biru dicabut" : "Centang biru diberikan") });
        if (u.sys_role !== "admin") items.push({ icon: "shield", label: "Jadikan admin", run: () => adminAct({ action: "role", userId: u.id, role: "admin" }, "Dijadikan admin") });
        if (u.sys_role !== "owner") items.push({ icon: "key", label: "Jadikan owner",
          run: () => confirm(`Jadikan @${u.username} owner?`, "Owner punya console penuh dan bisa menambah owner lain.", "Jadikan owner", () => adminAct({ action: "role", userId: u.id, role: "owner" }, "Dijadikan owner"), false) });
        if (u.sys_role !== "user") items.push({ icon: "user", label: "Jadikan user biasa", run: () => adminAct({ action: "role", userId: u.id, role: "user" }, "Role dicabut") });
      }
    }
    return items;
  }, [me.id, myRank, kickMember, adminAct, muteInGroup]);

  const isMainOwner = () => (me.email || "").trim().toLowerCase() === "kevsoft.cs@gmail.com";

  const isGroupManager = (c: Conv | null) => {
    if (!c || c.kind !== "group") return false;
    const role = c.my_group_role || (c.created_by === me.id ? "owner" : "");
    return role === "owner" || role === "admin" || c.created_by === me.id;
  };

  async function saveGroupInfo(c: Conv, title: string, description: string, handle?: string) {
    try {
      const body: Record<string, unknown> = { id: c.id, title: title.trim(), description: description.trim() || null };
      if (handle !== undefined) body.handle = handle.trim().toLowerCase();
      const r = await fetch("/api/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || "Gagal menyimpan"); return; }
      setConvs((list) => (list ?? []).map((x) => x.id === c.id ? { ...x, title: d.title, description: d.description, handle: d.handle } : x));
      toast("Info grup disimpan");
    } catch { toast("Jaringan bermasalah"); }
  }

  async function saveGroupRules(c: Conv, rules: string) {
    try {
      const r = await fetch("/api/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, rules: rules.trim() || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || "Gagal menyimpan aturan"); return false; }
      setConvs((list) => (list ?? []).map((x) => x.id === c.id ? { ...x, rules: d.rules } : x));
      toast(d.rules ? "Aturan grup disimpan" : "Aturan grup dihapus");
      return true;
    } catch { toast("Jaringan bermasalah"); return false; }
  }

  const groupLink = (c: Conv) => (c.handle ? `${window.location.origin}/${c.handle}` : "");

  // Teks lengkap grup (nama, deskripsi, aturan, link) untuk disalin / dibagikan.
  const groupInfoText = (c: Conv) => [
    c.title || "Grup",
    c.description ? `\n${c.description}` : "",
    c.rules ? `\nAturan grup:\n${c.rules}` : "",
    c.handle ? `\n${groupLink(c)}` : "",
  ].filter(Boolean).join("\n");

  // Isi menu titik tiga di pojok kanan atas chat.
  const headerItems = (c: Conv): MenuItem[] => {
    const items: MenuItem[] = [{ icon: "info", label: "Info", run: showInfo }];
    if (c.kind === "group") {
      if (isGroupManager(c)) items.push({ icon: "shield", label: "Atur aturan grup", run: () => setRulesOpen(true) });
      else if (c.rules) items.push({ icon: "shield", label: "Aturan grup", run: () => setRulesOpen(true) });
      if (c.handle) items.push({ icon: "link", label: "Salin link grup", run: () => copyText(groupLink(c), "Link grup disalin") });
      if (c.rules) items.push({ icon: "copy", label: "Salin aturan grup", run: () => copyText(c.rules || "", "Aturan grup disalin") });
      items.push({ icon: "copy", label: "Salin info grup", run: () => copyText(groupInfoText(c), "Info grup disalin") });
    }
    return [...items, ...convItems(c)];
  };

  async function uploadGroupAvatar(c: Conv, file: File) {
    try {
      const buf = await file.arrayBuffer();
      const r = await fetch(`/api/conversations/avatar?id=${c.id}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream", "x-conversation-id": c.id },
        body: buf,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || "Gagal unggah foto"); return; }
      setConvs((list) => (list ?? []).map((x) => x.id === c.id ? { ...x, other_avatar: d.avatar_url } : x));
      toast("Foto grup diperbarui");
    } catch { toast("Jaringan bermasalah"); }
  }

  async function shareGroupLink(c: Conv) {
    const h = c.handle;
    if (!h) { toast("Grup belum punya link. Atur handle dulu."); return; }
    const url = `${window.location.origin}/${h}`;
    try {
      if (navigator.share) await navigator.share({ title: c.title || "Grup", url });
      else { await navigator.clipboard.writeText(url); toast("Link grup disalin"); }
    } catch { try { await navigator.clipboard.writeText(url); toast("Link grup disalin"); } catch { toast("Gagal membagikan"); } }
  }

  async function removeGroupAvatar(c: Conv) {
    try {
      const r = await fetch(`/api/conversations/avatar?id=${c.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || "Gagal hapus foto"); return; }
      setConvs((list) => (list ?? []).map((x) => x.id === c.id ? { ...x, other_avatar: null } : x));
      toast("Foto grup dihapus");
    } catch { toast("Jaringan bermasalah"); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/sign-in");
  }

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (convs ?? []).filter((c) => {
      if (c.kind !== "ai" && tab === "dm" && c.kind !== "dm") return false;
      if (c.kind !== "ai" && tab === "group" && c.kind === "dm") return false;
      if (c.kind === "ai" && tab !== "all") return false;
      if (!s) return true;
      return convName(c).toLowerCase().includes(s) || (c.other_username ?? "").includes(s);
    });
  }, [convs, q, tab]);

  const subtitle = (c: Conv) => {
    const base = c.kind === "dm" ? `@${c.other_username}` : c.kind === "ai" ? "Asisten AI · selalu online" : `${c.member_count} anggota`;
    const d = c.disappear_seconds || 0;
    if (!d) return base;
    const label = d === 86400 ? "24 jam" : d === 604800 ? "7 hari" : d === 7776000 ? "90 hari" : `${d}s`;
    return `${base} · ⏱ ${label}`;
  };
  const groupLike = !!active && active.kind !== "dm" && active.kind !== "ai";

  async function setDisappear(seconds: number) {
    if (!active || active.kind === "ai") return;
    const { ok, data } = await (async () => {
      try {
        const r = await fetch("/api/conversations/disappear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: active.id, seconds }),
        });
        const d = await r.json().catch(() => ({}));
        return { ok: r.ok, data: d };
      } catch { return { ok: false, data: { error: "Jaringan bermasalah" } }; }
    })();
    if (!ok) { toast(data?.error || "Gagal mengatur pesan sementara"); return; }
    setConvs((list) => (list ?? []).map((c) => (c.id === active.id ? { ...c, disappear_seconds: seconds } : c)));
    toast(seconds === 0 ? "Pesan sementara dimatikan" : `Pesan sementara: ${seconds === 86400 ? "24 jam" : seconds === 604800 ? "7 hari" : "90 hari"}`);
  }

  return (
    <div className="app" data-chat={active ? "open" : "list"}>
      <aside className="side">
        <header className="bar">
          <div className="brand"><Logo /><div><strong>kevsoft-chat</strong><small>@{me.username}</small></div></div>
          <div className="bar-actions">
            <a className="icon-btn news-entry" href="/news" aria-label="Berita">
              <Icon n="news" />
            </a>
            {isStaffRole(me.role) && <button className="icon-btn" onClick={() => setShowConsole(true)} aria-label="Console"><Icon n="shield" /></button>}
            <button className="icon-btn" onClick={() => setShowNew(true)} aria-label="Chat baru"><Icon n="edit" /></button>
            <button className="account-btn" onClick={() => setProfile(true)} aria-label="Profil dan pengaturan"><Avatar name={me.name} src={me.avatarUrl} size={40} /></button>
          </div>
        </header>
        <div className="search"><Icon n="search" size={18} /><input placeholder="Cari chat" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari chat" /></div>
        <div className="tabs">
          {([["all", "Semua"], ["dm", "Pribadi"], ["group", "Grup"]] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <ul className="convs">
          {convs === null && Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="skel-row"><span className="skel av" /><span className="skel-lines"><i className="skel" /><i className="skel" /></span></li>
          ))}
          {convs !== null && list.length === 0 && <li className="empty">Tidak ada chat. Tekan ✎ untuk mulai chat atau buat grup.</li>}
          {list.map((c) => (
            <ConvItem key={c.id} c={c} on={activeId === c.id} leaving={leaving.includes(c.id)} meUsername={me.username} onOpen={open} onMenu={openConvMenu} />
          ))}
        </ul>
      </aside>

      <section className="main">
        {active ? (
          <>
            <header className="bar">
              <button className="icon-btn back" onClick={closeChat} aria-label="Kembali"><Icon n="back" /></button>
              <button className="who" onClick={showInfo}>
                <Avatar name={convName(active)} src={active.other_avatar} kind={active.kind === "dm" ? undefined : active.kind} size={42} />
                <div><strong>{convName(active)}{(active.kind === "ai" || (active.kind === "dm" && active.other_verified)) && <VerifiedBadge title={active.kind === "ai" ? "Kev-Ai terverifikasi" : "Terverifikasi"} />}</strong><small>{waiting ? "sedang mengetik…" : subtitle(active)}</small></div>
              </button>
              <button className="icon-btn" aria-label="Menu chat"
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const items = headerItems(active); setMenu({ ...placeMenu(r.right - 220, r.bottom + 6, items.length), items }); }}>
                <Icon n="more" />
              </button>
            </header>

            <div className="thread" ref={thread} onScroll={onScroll}>
              {loading && <div className="thread-skel" aria-hidden>{[0, 1, 0, 1, 0].map((r, i) => <i key={i} className={`skel ${r ? "r" : ""}`} style={{ width: `${38 + ((i * 17) % 30)}%` }} />)}</div>}
              {!loading && msgs.length >= 50 && !noMore && <button className="older" onClick={older}>Muat pesan sebelumnya</button>}
              {active.kind === "ai" && !loading && msgs.length === 0 && (
                <div className="hero-note"><Icon n="sparkle" size={28} /><h3>Halo, aku Kev-Ai</h3><p>Tulis pertanyaan apa saja. Di grup atau komunitas, panggil aku dengan <b>@kev-ai</b> diikuti pertanyaanmu.</p></div>
              )}
              {msgs.map((m, i) => {
                const prev = msgs[i - 1];
                const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                const first = newDay || !prev || prev.sender_id !== m.sender_id || prev.kind !== m.kind;
                const mine = m.sender_id === me.id;
                // Centang biru: chat AI selalu (setelah terkirim), atau @kev-ai di grup setelah AI membalas
                const isAiConv = active?.kind === "ai";
                const mentionsAi = (m.mentions || []).includes(AI_HANDLE);
                const aiRepliedAfter = msgs.slice(i + 1).some((x) => x.kind === "ai");
                const readBlue = mine && m.status !== "sending" && m.status !== "failed" && (
                  isAiConv || (mentionsAi && aiRepliedAfter)
                );
                return (
                  <MessageRow key={m.id} m={m} mine={mine} first={first} newDay={newDay}
                    showName={!mine && first && groupLike} showAv={!mine && groupLike} meUsername={me.username}
                    fresh={fresh.current.has(m.id)} leaving={leavingMsgs.includes(m.id)} readBlue={readBlue}
                    onMenu={openMsgMenu} onRetry={retry}
                    onOpenProfile={(u) => { window.location.href = "/" + encodeURIComponent(u); }} />
                );
              })}
              {waiting && <div className="msg ai first"><div className="bubble typing"><i /><i /><i /></div></div>}
            </div>

            {away && (
              <button className="jump" onClick={toBottom} aria-label="Ke pesan terbaru">
                <Icon n="down" size={22} />{newBelow > 0 && <b>{newBelow > 99 ? "99+" : newBelow}</b>}
              </button>
            )}

            <Composer convId={active.id} kind={active.kind} me={me.username} replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)} onSend={send} taRef={taRef}
              onSendMedia={async (file, caption) => {
                if (file.size > 400_000) { toast("File terlalu besar (maks ~400KB)"); return; }
                if (/zip/i.test(file.name) || /zip|compressed/.test(file.type)) { toast("ZIP tidak diizinkan"); return; }
                const buf = await file.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = "";
                const chunk = 0x8000;
                for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
                const b64 = btoa(binary);
                const id = crypto.randomUUID();
                const optimistic: Msg = {
                  id, conversation_id: active.id, sender_id: me.id, kind: "user", body: caption || "",
                  created_at: new Date().toISOString(), reply_to: null, mentions: [], username: me.username,
                  name: me.name, avatar_url: me.avatarUrl ?? null, verified: !!me.verified, reply_body: null, reply_username: null,
                  deleted_at: null, has_media: true, media_mime: file.type, media_name: file.name, status: "sending",
                };
                setMsgs((x) => [...x, optimistic]);
                try {
                  const r = await fetch("/api/messages/media", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, conversationId: active.id, body: caption, mime: file.type, name: file.name, data: b64 }),
                  });
                  if (!r.ok) throw new Error();
                  setMsgs((x) => x.map((y) => y.id === id ? { ...y, status: "sent" } : y));
                } catch {
                  setMsgs((x) => x.map((y) => y.id === id ? { ...y, status: "failed" } : y));
                  toast("Gagal mengirim file");
                }
              }}
              onSendPoll={async (question, options) => {
                try {
                  const r = await fetch("/api/messages/poll", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conversationId: active.id, question, options }),
                  });
                  if (!r.ok) { const d = await r.json().catch(() => ({})); toast(d.error || "Gagal buat polling"); }
                } catch { toast("Gagal buat polling"); }
              }} />

            {info && (
              <aside className="info">
                <header><button className="icon-btn" onClick={() => setInfo(false)} aria-label="Tutup"><Icon n="close" /></button><strong>Info</strong></header>
                <div className={active.kind === "dm" ? "cover-hero" : "info-hero"}>
                  {active.kind === "dm" && <Banner name={convName(active)} src={active.other_banner} />}
                  <div className="group-av-wrap">
                    <button className="zoomable" disabled={!active.other_avatar} onClick={() => active.other_avatar && setZoom(active.other_avatar)} aria-label="Perbesar foto">
                      <Avatar name={convName(active)} src={active.other_avatar} kind={active.kind === "dm" ? undefined : active.kind} size={96} />
                    </button>
                    {((active.kind === "group" && isGroupManager(active)) || (active.kind === "community" && isMainOwner())) && (
                      <label className="group-av-edit" title={active.kind === "community" ? "Ganti foto komunitas" : "Ganti foto grup"}>
                        <Icon n="camera" size={16} />
                        <input type="file" accept="image/jpeg,image/png,image/webp" hidden
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadGroupAvatar(active, f); }} />
                      </label>
                    )}
                  </div>
                  <h2>{convName(active)}{(active.kind === "ai" || (active.kind === "dm" && active.other_verified)) && <VerifiedBadge title={active.kind === "ai" ? "Kev-Ai terverifikasi" : "Terverifikasi"} />}</h2>
                  <p className="muted">{active.kind === "dm" ? `@${active.other_username}` : subtitle(active)}</p>
                  {active.kind === "dm" && active.other_bio && <p className="desc">{active.other_bio}</p>}
                  {active.description && active.kind !== "group" && active.kind !== "community" && <p className="desc">{active.description}</p>}
                  {active.kind === "ai" && <p className="desc">Kev-Ai menjawab lewat kev-ai.vercel.app. Di grup, panggil dengan @kev-ai lalu tulis pertanyaannya.</p>}
                  {active.kind === "group" && isGroupManager(active) && (
                    <GroupEditForm
                      key={active.id + String(active.title) + String(active.description) + String(active.handle)}
                      title={active.title || ""}
                      description={active.description || ""}
                      handle={active.handle || ""}
                      hasAvatar={!!active.other_avatar}
                      onSave={(title, desc, handle) => saveGroupInfo(active, title, desc, handle)}
                      onRemoveAvatar={() => removeGroupAvatar(active)}
                      onShare={() => shareGroupLink(active)}
                    />
                  )}
                  {active.kind === "group" && !isGroupManager(active) && active.description && (
                    <p className="desc">{active.description}</p>
                  )}
                  {active.kind === "community" && isMainOwner() && (
                    <CommunityEditForm
                      key={active.id + String(active.title) + String(active.description)}
                      title={active.title || "Komunitas Kevsoft"}
                      description={active.description || ""}
                      hasAvatar={!!active.other_avatar}
                      onSave={async (title, desc) => {
                        try {
                          const r = await fetch("/api/conversations", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: active.id, title: title.trim(), description: desc.trim() || null }),
                          });
                          const d = await r.json().catch(() => ({}));
                          if (!r.ok) { toast(d.error || "Gagal menyimpan"); return; }
                          setConvs((list) => (list ?? []).map((x) => x.id === active.id ? { ...x, title: d.title, description: d.description } : x));
                          toast("Info komunitas disimpan");
                        } catch { toast("Jaringan bermasalah"); }
                      }}
                      onRemoveAvatar={() => removeGroupAvatar(active)}
                    />
                  )}
                  {active.kind === "community" && !isMainOwner() && active.description && (
                    <p className="desc">{active.description}</p>
                  )}
                  {active.kind === "group" && active.handle && (
                    <div className="group-edit-actions">
                      <button type="button" className="link" onClick={() => shareGroupLink(active)}>
                        <Icon n="share" size={14} /> Bagikan link grup
                      </button>
                      <span className="muted small">/{active.handle}</span>
                    </div>
                  )}

                </div>
                {/* Chat pribadi: tidak tampil daftar anggota — hanya profil lawan bicara + aksi */}
                {active.kind === "dm" && active.other_id && (
                  <div className="info-contact-actions">
                    <button type="button" onClick={() => active.other_username && (window.location.href = "/" + encodeURIComponent(active.other_username))}>
                      <Icon n="user" size={18} />Lihat profil
                    </button>
                    <button type="button" onClick={() => copyText("@" + (active.other_username || ""), "Username disalin")}>
                      <Icon n="copy" size={18} />Salin username
                    </button>
                    <button type="button" onClick={() => saveContact({ username: active.other_username || "", name: active.other_name, bio: active.other_bio })}>
                      <Icon n="user" size={18} />Simpan kontak
                    </button>
                  </div>
                )}

                {/* Grup / komunitas: daftar anggota; ketuk = info lengkap */}
                {(active.kind === "group" || active.kind === "community") && (
                  <>
                    <h4>
                      {members.length} anggota
                      {active.kind === "group" && isGroupManager(active) && (
                        <button type="button" className="link add-member-btn" onClick={() => setAddMemberOpen((o) => !o)}>
                          {addMemberOpen ? "Tutup" : "Tambah"}
                        </button>
                      )}
                    </h4>
                    {addMemberOpen && active.kind === "group" && isGroupManager(active) && (
                      <div className="add-member-box">
                        <div className="search member-search">
                          <Icon n="search" size={18} />
                          <input
                            placeholder="Cari username untuk ditambah"
                            value={addQ}
                            onChange={(e) => searchAddMembers(e.target.value, active.id)}
                            aria-label="Cari pengguna"
                            autoFocus
                          />
                        </div>
                        {addHits.length > 0 && (
                          <ul className="add-member-list">
                            {addHits.map((u) => (
                              <li key={u.id}>
                                <button type="button" disabled={addBusy}
                                  onClick={() => addMembersToGroup(active.id, [u.username])}>
                                  <Avatar name={u.name || u.username} src={u.avatar_url} size={36} />
                                  <span>
                                    <b>{u.name || u.username}</b>
                                    <small>@{u.username}</small>
                                  </span>
                                  <Icon n="plus" size={18} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {addQ.trim() && addHits.length === 0 && (
                          <p className="muted small" style={{ padding: "6px 4px" }}>Tidak ada hasil / sudah anggota</p>
                        )}
                      </div>
                    )}
                    {members.length > 8 && (
                      <div className="search member-search"><Icon n="search" size={18} /><input placeholder="Cari anggota" value={memberQ} onChange={(e) => setMemberQ(e.target.value)} aria-label="Cari anggota" /></div>
                    )}
                    <ul className="members">
                      {members.filter((u) => {
                        const t = memberQ.trim().toLowerCase().replace(/^@/, "");
                        return !t || u.username.toLowerCase().includes(t) || (u.name ?? "").toLowerCase().includes(t);
                      }).map((u) => {
                        const items = memberItems(u, active, members);
                        return (
                          <li key={u.id} className="member-row">
                            <button type="button" className="member-main" onClick={() => setViewUser(u)} aria-label={`Info @${u.username}`}>
                              <Avatar name={u.name || u.username} src={u.avatar_url} size={38} />
                              <span>
                                <b>{u.name || u.username}{u.verified && <VerifiedBadge />}{u.id === me.id && " (kamu)"}<RoleBadge role={u.role} labels={roleLabels} />{u.banned && <em className="badge warn">diblokir</em>}{u.muted && <em className="badge warn">bisu</em>}{(u as any).group_muted && <em className="badge warn">bisu grup</em>}</b>
                                <small>{u.bio || `@${u.username}`}</small>
                              </span>
                            </button>
                            {items.length > 0 && (
                              <button className="icon-btn mini" aria-label={`Tindakan untuk @${u.username}`}
                                onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ ...placeMenu(r.right - 220, r.bottom + 6, items.length), items }); }}>
                                <Icon n="more" size={18} />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {active.kind !== "ai" && (
                  <div className="info-disappear">
                    <h4>Pesan sementara</h4>
                    <p className="muted small">Pesan baru hilang otomatis setelah waktu yang dipilih (ala WhatsApp).</p>
                    <div className="disappear-opts">
                      {([[0, "Mati"], [86400, "24 jam"], [604800, "7 hari"], [7776000, "90 hari"]] as const).map(([sec, lab]) => (
                        <button
                          key={sec}
                          className={(active.disappear_seconds || 0) === sec ? "on" : ""}
                          onClick={() => setDisappear(sec)}
                        >{lab}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="info-actions">
                  <button onClick={() => askConv(active, "clear")}><Icon n="trash" size={18} />Bersihkan chat (untuk saya)</button>
                  {active.kind === "dm" && <button className="danger" onClick={() => askConv(active, "delete")}><Icon n="trash" size={18} />Hapus chat</button>}
                  {active.kind === "group" && isGroupManager(active) && (
                    <>
                      <button onClick={async () => {
                        if (!confirm("Reset link grup? Link lama tidak bisa dipakai lagi.")) return;
                        try {
                          const r = await fetch("/api/conversations", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: active.id, reset_handle: true }),
                          });
                          const d = await r.json().catch(() => ({}));
                          if (!r.ok) { toast(d.error || "Gagal reset link"); return; }
                          setConvs((list) => (list ?? []).map((x) => x.id === active.id ? { ...x, handle: d.handle } : x));
                          toast(`Link baru: /${d.handle}`);
                        } catch { toast("Jaringan bermasalah"); }
                      }}><Icon n="link" size={18} />Reset link grup</button>
                      <button className="danger" onClick={() => {
                        setDialog({
                          title: "Hapus semua chat grup?",
                          text: "Semua pesan di grup ini akan dihapus untuk semua anggota. Tidak bisa dibatalkan.",
                          actions: [{
                            label: "Hapus semua chat", danger: true, run: async () => {
                              try {
                                const r = await fetch(`/api/conversations?id=${active.id}&mode=clear_all`, { method: "DELETE" });
                                const d = await r.json().catch(() => ({}));
                                if (!r.ok) { toast(d.error || "Gagal"); return; }
                                setMsgs([]); setInfo(false);
                                if (cache.current[active.id]) cache.current[active.id] = [];
                                toast("Semua chat grup dihapus");
                                scheduleConvs();
                              } catch { toast("Jaringan bermasalah"); }
                            },
                          }],
                        });
                      }}><Icon n="trash" size={18} />Hapus semua chat grup</button>
                    </>
                  )}
                  {active.kind === "group" && (active.my_group_role === "owner" || active.created_by === me.id) && (
                    <button className="danger" onClick={() => {
                      setDialog({
                        title: "Hapus grup?",
                        text: `Grup “${convName(active)}” beserta semua pesan dan anggota akan dihapus permanen.`,
                        actions: [{
                          label: "Hapus grup", danger: true, run: async () => {
                            try {
                              const r = await fetch(`/api/conversations?id=${active.id}&mode=destroy`, { method: "DELETE" });
                              const d = await r.json().catch(() => ({}));
                              if (!r.ok) { toast(d.error || "Gagal hapus grup"); return; }
                              setInfo(false); closeChat(); scheduleConvs();
                              toast("Grup dihapus");
                            } catch { toast("Jaringan bermasalah"); }
                          },
                        }],
                      });
                    }}><Icon n="trash" size={18} />Hapus grup</button>
                  )}
                  {active.kind === "group" && <button className="danger" onClick={() => askConv(active, "delete")}><Icon n="logout" size={18} />Keluar grup</button>}
                </div>
              </aside>
            )}
          </>
        ) : (
          <div className="blank">
            <Logo size={96} />
            <h2>kevsoft-chat</h2>
            <p className="muted">Pilih percakapan untuk mulai. Ngobrol di Komunitas Kevsoft, chat pribadi, atau tanya <b>@kev-ai</b>.</p>
          </div>
        )}
      </section>

      {viewUser && (
        <aside className="contact-sheet" aria-label={`Info @${viewUser.username}`}>
          <header>
            <button className="icon-btn" onClick={() => setViewUser(null)} aria-label="Tutup"><Icon n="close" /></button>
            <strong>Info kontak</strong>
          </header>
          <div className="cover-hero">
            <Banner name={viewUser.name || viewUser.username} src={viewUser.banner_url} />
            <button className="zoomable" disabled={!viewUser.avatar_url} onClick={() => viewUser.avatar_url && setZoom(viewUser.avatar_url)} aria-label="Perbesar foto">
              <Avatar name={viewUser.name || viewUser.username} src={viewUser.avatar_url} size={96} />
            </button>
            <h2>{viewUser.name || viewUser.username}{viewUser.verified && <VerifiedBadge />}{viewUser.id === me.id ? " (kamu)" : ""}</h2>
            <p className="muted">@{viewUser.username}</p>
            {viewUser.bio && <p className="desc">{viewUser.bio}</p>}
            <div className="contact-badges">
              <RoleBadge role={viewUser.role || viewUser.sys_role} title={(viewUser as any).role_title} labels={roleLabels} />
              {viewUser.banned && <em className="badge warn">diblokir</em>}
              {viewUser.muted && <em className="badge warn">bisu</em>}
            </div>
          </div>
          <div className="info-contact-actions">
            <button type="button" onClick={() => { window.location.href = "/" + encodeURIComponent(viewUser.username); }}>
              <Icon n="user" size={18} />Lihat profil
            </button>
            {viewUser.id !== me.id && (
              <button type="button" onClick={() => openDmWith(viewUser.username)}>
                <Icon n="chat" size={18} />Chat pribadi
              </button>
            )}
            <button type="button" onClick={() => copyText("@" + viewUser.username, "Username disalin")}>
              <Icon n="copy" size={18} />Salin username
            </button>
            <button type="button" onClick={() => saveContact(viewUser)}>
              <Icon n="user" size={18} />Simpan kontak
            </button>
            {viewUser.id !== me.id && active && (active.kind === "group" || active.kind === "community") && (() => {
              const items = memberItems(viewUser, active, members);
              return items.length > 0 ? (
                <button type="button" className="danger" onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setMenu({ ...placeMenu(r.left, r.bottom + 6, items.length), items });
                }}>
                  <Icon n="more" size={18} />Moderasi
                </button>
              ) : null;
            })()}
          </div>
        </aside>
      )}
      {profile && (
        <Profile me={me} onClose={() => setProfile(false)} onToast={toast} onLogout={logout}
          onConsole={isStaffRole(me.role) ? () => { setProfile(false); setShowConsole(true); } : undefined}
          onUpdate={(p) => setMe((x) => ({ ...x, ...p }))} />
      )}
      {showConsole && <Console me={me} onClose={() => setShowConsole(false)} onToast={toast} onChanged={scheduleConvs} />}
      {showNew && <NewChat onClose={() => setShowNew(false)} onCreated={openById} />}
      {rulesOpen && active?.kind === "group" && (
        <RulesModal
          key={active.id + String(active.rules)}
          rules={active.rules || ""}
          canEdit={isGroupManager(active)}
          onSave={(txt) => saveGroupRules(active, txt)}
          onCopy={(txt) => copyText(txt, "Aturan grup disalin")}
          onClose={() => setRulesOpen(false)}
        />
      )}
      {menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {dialog && <Dialog title={dialog.title} text={dialog.text} actions={dialog.actions} onClose={() => setDialog(null)} />}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      {toastText && <div className="toast" role="status">{toastText}</div>}
    </div>
  );
}

function GroupEditForm({ title, description, handle, hasAvatar, onSave, onRemoveAvatar, onShare }: {
  title: string; description: string; handle: string; hasAvatar: boolean;
  onSave: (title: string, description: string, handle: string) => void;
  onRemoveAvatar: () => void;
  onShare: () => void;
}) {
  const [t, setT] = useState(title);
  const [d, setD] = useState(description);
  const [h, setH] = useState(handle);
  const [open, setOpen] = useState(false);
  const dirty = t.trim() !== (title || "").trim() || d.trim() !== (description || "").trim() || h.trim().toLowerCase() !== (handle || "").trim().toLowerCase();
  if (!open) {
    return (
      <div className="group-edit-actions">
        <button type="button" className="link" onClick={() => setOpen(true)}>Ubah nama, handle & deskripsi</button>
        {handle && <button type="button" className="link" onClick={onShare}>Bagikan link</button>}
        {hasAvatar && <button type="button" className="link danger" onClick={onRemoveAvatar}>Hapus foto grup</button>}
        {handle && <span className="muted small">Link: /{handle}</span>}
      </div>
    );
  }
  return (
    <div className="group-edit-form">
      <label>
        Nama grup
        <input className="field" maxLength={60} value={t} onChange={(e) => setT(e.target.value)} />
      </label>
      <label>
        Handle link (pendek)
        <input className="field" maxLength={20} value={h} onChange={(e) => setH(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ""))} placeholder="nama_grup" />
        <small className="muted">Link: /{h || "…"} — boleh dibuka & dibagikan</small>
      </label>
      <label>
        Deskripsi
        <textarea className="field" rows={2} maxLength={200} value={d} onChange={(e) => setD(e.target.value)} placeholder="Opsional" />
      </label>
      <div className="group-edit-actions">
        <button type="button" className="link" onClick={() => { setOpen(false); setT(title); setD(description); setH(handle); }}>Batal</button>
        <button type="button" className="primary group-save" disabled={!t.trim() || !h.trim() || !dirty} onClick={() => { onSave(t, d, h); setOpen(false); }}>Simpan</button>
      </div>
    </div>
  );
}

function CommunityEditForm({ title, description, hasAvatar, onSave, onRemoveAvatar }: {
  title: string; description: string; hasAvatar: boolean;
  onSave: (title: string, description: string) => void;
  onRemoveAvatar: () => void;
}) {
  const [t, setT] = useState(title);
  const [d, setD] = useState(description);
  const [open, setOpen] = useState(false);
  const dirty = t.trim() !== (title || "").trim() || d.trim() !== (description || "").trim();
  if (!open) {
    return (
      <div className="group-edit-actions">
        <button type="button" className="link" onClick={() => setOpen(true)}>Ubah nama & deskripsi komunitas</button>
        {hasAvatar && <button type="button" className="link danger" onClick={onRemoveAvatar}>Hapus foto komunitas</button>}
      </div>
    );
  }
  return (
    <div className="group-edit-form">
      <label>
        Nama komunitas
        <input className="field" maxLength={60} value={t} onChange={(e) => setT(e.target.value)} />
      </label>
      <label>
        Deskripsi
        <textarea className="field" rows={3} maxLength={200} value={d} onChange={(e) => setD(e.target.value)} placeholder="Deskripsi komunitas" />
      </label>
      <div className="group-edit-actions">
        <button type="button" className="link" onClick={() => { setOpen(false); setT(title); setD(description); }}>Batal</button>
        <button type="button" className="primary group-save" disabled={!t.trim() || !dirty} onClick={() => { onSave(t, d); setOpen(false); }}>Simpan</button>
      </div>
    </div>
  );
}

const RULES_MAX = 1000;
const RULES_TEMPLATE = "1. Saling menghormati, tanpa kata kasar.\n2. Dilarang spam dan promosi tanpa izin.\n3. Dilarang konten SARA, porno, atau ilegal.\n4. Gunakan grup sesuai topiknya.";

// Aturan grup: owner/admin grup bisa set & ubah, anggota lain hanya melihat & menyalin.
function RulesModal({ rules, canEdit, onSave, onCopy, onClose }: {
  rules: string; canEdit: boolean;
  onSave: (rules: string) => Promise<boolean>;
  onCopy: (rules: string) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(rules);
  const [busy, setBusy] = useState(false);
  const dirty = v.trim() !== rules.trim();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal rules-modal" role="dialog" aria-label="Aturan grup" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Aturan grup</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon n="close" /></button>
        </header>
        {canEdit ? (
          <>
            <textarea className="field rules-input" rows={9} maxLength={RULES_MAX} value={v} autoFocus
              onChange={(e) => setV(e.target.value)} placeholder="Tulis aturan grup, satu aturan per baris" />
            <div className="rules-meta">
              <button type="button" className="link" onClick={() => setV(RULES_TEMPLATE)}>Pakai contoh</button>
              <span className="muted small">{v.length}/{RULES_MAX}</span>
            </div>
          </>
        ) : (
          <div className="rules-text">{rules || "Belum ada aturan."}</div>
        )}
        <div className="rules-actions">
          {(canEdit ? v.trim() : rules) && (
            <button type="button" className="link" onClick={() => onCopy(canEdit ? v.trim() : rules)}>
              <Icon n="copy" size={14} /> Salin
            </button>
          )}
          {canEdit && rules && (
            <button type="button" className="link danger" disabled={busy}
              onClick={async () => { setBusy(true); const ok = await onSave(""); setBusy(false); if (ok) onClose(); }}>
              Hapus aturan
            </button>
          )}
          {canEdit && (
            <button type="button" className="primary" disabled={busy || !dirty}
              onClick={async () => { setBusy(true); const ok = await onSave(v); setBusy(false); if (ok) onClose(); }}>
              Simpan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
