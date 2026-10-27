"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Pusher from "pusher-js";
import { AI_HANDLE, parseMentions } from "@/lib/mentions";
import { readPref } from "@/lib/prefs";
import { blip, unlockAudio } from "@/lib/sound";
import Composer from "./Composer";
import ConvItem from "./ConvItem";
import MessageRow from "./MessageRow";
import NewChat from "./NewChat";
import Profile from "./Profile";
import { Dialog, Lightbox, Menu, type DialogAction, type MenuItem } from "./overlays";
import { Avatar, Icon, Logo, convName, type Conv, type Me, type Msg, type UserLite } from "./ui";

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
    const r = await fetch(`/api/messages?conversationId=${id}`);
    if (r.status === 401) { window.location.assign("/sign-in"); return null; }
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export default function Chat({ me: me0, pusherKey, pusherCluster }: { me: Me; pusherKey: string; pusherCluster: string }) {
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

    ch.bind("conversation", () => scheduleConvs());

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
  }, [me0.id, pusherKey, pusherCluster, loadConvs, scheduleConvs, bump, markRead, mutate]);

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
    setReplyTo(null); setInfo(false); setMembers([]); setMenu(null);
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
      if (!r.ok) throw new Error(String(r.status));
      const s = await r.json();
      patch({ status: "sent", created_at: s.created_at, mentions: s.mentions });
    } catch {
      patch({ status: "failed" });
      setAiWait((w) => w.filter((x) => x !== m.conversation_id));
    }
  }, [mutate]);

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
      reply_to: rt?.id ?? null, mentions: parseMentions(body), username: mm.username, name: mm.name, avatar_url: mm.avatarUrl ?? null,
      reply_body: rt ? (rt.deleted_at ? "" : rt.body.slice(0, 140)) : null, reply_username: rt ? rt.username : null,
      deleted_at: null, status: "sending",
    };
    fresh.current.add(m.id); stick.current = true;
    setMsgs((x) => [...x, m]);
    setReplyTo(null);
    bump(m, false, true);
    if (kind === "ai" || m.mentions.includes(AI_HANDLE)) {
      setAiWait((w) => [...w, cid]);
      setTimeout(() => setAiWait((w) => w.filter((x) => x !== cid)), 60_000);
    }
    if (readPref("sound", true)) blip("out");
    deliver(m);
  }, [bump, deliver]);

  // ---------- hapus pesan ----------
  const deleteMsg = useCallback(async (m: Msg, scope: "me" | "all") => {
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
    if (mine) actions.push({ label: "Hapus untuk semua orang", danger: true, run: () => deleteMsg(m, "all") });
    actions.push({ label: "Hapus untuk saya", danger: !mine, run: () => deleteMsg(m, "me") });
    setDialog({ title: "Hapus pesan?", text: mine ? "Hapus untuk semua orang akan menghilangkan pesan ini dari semua anggota percakapan." : undefined, actions });
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

  async function showInfo() {
    if (!active) return;
    setInfo(true);
    if (active.kind !== "ai") {
      try { const r = await fetch(`/api/members?conversationId=${active.id}`); if (r.ok) setMembers(await r.json()); } catch {}
    }
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

  const subtitle = (c: Conv) =>
    c.kind === "dm" ? `@${c.other_username}` : c.kind === "ai" ? "Asisten AI · selalu online" : `${c.member_count} anggota`;
  const groupLike = !!active && active.kind !== "dm" && active.kind !== "ai";

  return (
    <div className="app" data-chat={active ? "open" : "list"}>
      <aside className="side">
        <header className="bar">
          <div className="brand"><Logo /><div><strong>kevsoft-chat</strong><small>@{me.username}</small></div></div>
          <div className="bar-actions">
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
        {profile && (
          <Profile me={me} onClose={() => setProfile(false)} onToast={toast} onLogout={logout}
            onUpdate={(p) => setMe((x) => ({ ...x, ...p }))} />
        )}
      </aside>

      <section className="main">
        {active ? (
          <>
            <header className="bar">
              <button className="icon-btn back" onClick={closeChat} aria-label="Kembali"><Icon n="back" /></button>
              <button className="who" onClick={showInfo}>
                <Avatar name={convName(active)} src={active.other_avatar} kind={active.kind === "dm" ? undefined : active.kind} size={42} />
                <div><strong>{convName(active)}</strong><small>{waiting ? "sedang mengetik…" : subtitle(active)}</small></div>
              </button>
              <button className="icon-btn" aria-label="Menu chat"
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const items: MenuItem[] = [{ icon: "info", label: "Info", run: showInfo }, ...convItems(active)]; setMenu({ ...placeMenu(r.right - 220, r.bottom + 6, items.length), items }); }}>
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
                return (
                  <MessageRow key={m.id} m={m} mine={mine} first={first} newDay={newDay}
                    showName={!mine && first && groupLike} showAv={!mine && groupLike} meUsername={me.username}
                    fresh={fresh.current.has(m.id)} leaving={leavingMsgs.includes(m.id)} onMenu={openMsgMenu} onRetry={retry} />
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
              onCancelReply={() => setReplyTo(null)} onSend={send} taRef={taRef} />

            {info && (
              <aside className="info">
                <header><button className="icon-btn" onClick={() => setInfo(false)} aria-label="Tutup"><Icon n="close" /></button><strong>Info</strong></header>
                <div className="info-hero">
                  <button className="zoomable" disabled={!active.other_avatar || active.kind !== "dm"} onClick={() => active.other_avatar && setZoom(active.other_avatar)} aria-label="Perbesar foto">
                    <Avatar name={convName(active)} src={active.other_avatar} kind={active.kind === "dm" ? undefined : active.kind} size={96} />
                  </button>
                  <h2>{convName(active)}</h2>
                  <p className="muted">{active.kind === "dm" ? `@${active.other_username}` : subtitle(active)}</p>
                  {active.kind === "dm" && active.other_bio && <p className="desc">{active.other_bio}</p>}
                  {active.description && <p className="desc">{active.description}</p>}
                  {active.kind === "ai" && <p className="desc">Kev-Ai menjawab lewat kev-ai.vercel.app. Di grup, panggil dengan @kev-ai lalu tulis pertanyaannya.</p>}
                </div>
                {active.kind !== "ai" && (
                  <>
                    <h4>{active.kind === "dm" ? "Anggota" : `${members.length} anggota`}</h4>
                    <ul className="members">
                      {members.map((u) => (
                        <li key={u.id}><Avatar name={u.name || u.username} src={u.avatar_url} size={38} />
                          <span><b>{u.name || u.username}{u.id === me.id && " (kamu)"}</b><small>{u.bio || `@${u.username}`}</small></span>
                          {u.role === "admin" && <em className="badge">admin</em>}</li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="info-actions">
                  <button onClick={() => askConv(active, "clear")}><Icon n="trash" size={18} />Bersihkan chat</button>
                  {active.kind === "dm" && <button className="danger" onClick={() => askConv(active, "delete")}><Icon n="trash" size={18} />Hapus chat</button>}
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

      {showNew && <NewChat onClose={() => setShowNew(false)} onCreated={openById} />}
      {menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {dialog && <Dialog title={dialog.title} text={dialog.text} actions={dialog.actions} onClose={() => setDialog(null)} />}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      {toastText && <div className="toast" role="status">{toastText}</div>}
    </div>
  );
}
