"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Pusher from "pusher-js";
import Account from "./Account";
import { AI_HANDLE, aiPrompt, parseMentions } from "@/lib/mentions";
import NewChat from "./NewChat";
import { Avatar, Icon, Logo, Rich, clock, convName, dayLabel, listTime, nameColor, type Conv, type Me, type Msg, type UserLite } from "./ui";

type Sug = { username: string; name: string; avatar_url: string | null; ai?: boolean };
const post = (url: string, body: object) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function Chat({ me, pusherKey, pusherCluster }: { me: Me; pusherKey: string; pusherCluster: string }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "dm" | "group">("all");
  const [showNew, setShowNew] = useState(false);
  const [info, setInfo] = useState(false);
  const [members, setMembers] = useState<UserLite[]>([]);
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [sugIdx, setSugIdx] = useState(0);
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [aiWait, setAiWait] = useState<string[]>([]);
  const [err, setErr] = useState("");

  const activeId = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const skipScroll = useRef(false);
  const convsRef = useRef<Conv[]>([]);
  convsRef.current = convs;

  const loadConvs = useCallback(async () => {
    const r = await fetch("/api/conversations");
    if (r.ok) setConvs(await r.json());
  }, []);

  const markRead = useCallback((id: string) => { post("/api/read", { conversationId: id }).then(loadConvs); }, [loadConvs]);

  useEffect(() => {
    loadConvs();
    const pusher = new Pusher(pusherKey, {
      cluster: pusherCluster,
      channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
    });
    const ch = pusher.subscribe(`private-user-${me.id}`);
    ch.bind("message", (m: Msg) => {
      if (m.kind === "ai") setAiWait((w) => w.filter((x) => x !== m.conversation_id));
      if (m.conversation_id === activeId.current) {
        setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
        if (m.sender_id !== me.id) markRead(m.conversation_id);
      }
      loadConvs();
    });
    ch.bind("conversation", () => loadConvs());
    return () => { pusher.disconnect(); };
  }, [me.id, pusherKey, pusherCluster, loadConvs, markRead]);

  const totalUnread = convs.reduce((n, c) => n + c.unread, 0);
  useEffect(() => { document.title = totalUnread ? `(${totalUnread}) kevsoft-chat` : "kevsoft-chat"; }, [totalUnread]);

  useEffect(() => {
    if (skipScroll.current) { skipScroll.current = false; return; }
    bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs, aiWait]);

  async function open(c: Conv) {
    setActive(c); activeId.current = c.id; setMsgs([]); setReplyTo(null); setInfo(false); setText(""); setMentionQ(null); setErr("");
    const r = await fetch(`/api/messages?conversationId=${c.id}`);
    if (r.ok) setMsgs(await r.json());
    loadConvs();
  }
  async function openById(id: string) {
    setShowNew(false);
    const r = await fetch("/api/conversations");
    if (!r.ok) return;
    const list: Conv[] = await r.json();
    setConvs(list);
    const c = list.find((x) => x.id === id);
    if (c) open(c);
  }
  async function older() {
    if (!active || msgs.length === 0) return;
    const r = await fetch(`/api/messages?conversationId=${active.id}&before=${encodeURIComponent(msgs[0].created_at)}`);
    if (r.ok) { skipScroll.current = true; const more: Msg[] = await r.json(); setMsgs((x) => [...more, ...x]); }
  }

  // ---- @tag autocomplete ----
  function detectMention(value: string, caret: number) {
    const m = /(^|[^a-z0-9_.@-])@([a-z0-9_.-]{0,20})$/i.exec(value.slice(0, caret));
    setMentionQ(m ? m[2].toLowerCase() : null);
    setSugIdx(0);
  }
  useEffect(() => {
    if (mentionQ === null || !active) { setSugs([]); return; }
    const showAi = active.kind !== "ai" && AI_HANDLE.startsWith(mentionQ);
    const ai: Sug[] = showAi ? [{ username: AI_HANDLE, name: "Kev-Ai", avatar_url: null, ai: true }] : [];
    let dead = false;
    const t = setTimeout(async () => {
      let users: Sug[] = [];
      if (active.kind !== "ai") {
        const r = await fetch(`/api/users?q=${encodeURIComponent(mentionQ)}&cid=${active.id}`);
        if (r.ok) users = (await r.json()).map((u: UserLite) => ({ username: u.username, name: u.name || u.username, avatar_url: u.avatar_url }));
      }
      if (!dead) setSugs([...ai, ...users]);
    }, 120);
    if (ai.length) setSugs(ai);
    return () => { dead = true; clearTimeout(t); };
  }, [mentionQ, active]);

  function pick(s: Sug) {
    const el = ta.current; if (!el) return;
    const caret = el.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@[a-z0-9_.-]*$/i, `@${s.username} `);
    const next = before + text.slice(caret);
    setText(next); setMentionQ(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); });
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQ !== null && sugs.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSugIdx((i) => (i + 1) % sugs.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSugIdx((i) => (i - 1 + sugs.length) % sugs.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(sugs[sugIdx]); return; }
      if (e.key === "Escape") { setMentionQ(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); send(); }
  }

  const mentioned = useMemo(() => parseMentions(text), [text]);
  const aiHint = active && active.kind !== "ai" && mentioned.includes(AI_HANDLE);

  async function send() {
    const body = text.trim();
    if (!body || !active) return;
    const cid = active.id;
    const callsAi = active.kind === "ai" || parseMentions(body).includes(AI_HANDLE);
    setText(""); setMentionQ(null); setErr("");
    const rt = replyTo; setReplyTo(null);
    if (callsAi) {
      setAiWait((w) => [...w, cid]);
      setTimeout(() => setAiWait((w) => w.filter((x) => x !== cid)), 60_000);
    }
    const r = await post("/api/messages", { conversationId: cid, body, replyTo: rt?.id });
    if (r.ok) { const m: Msg = await r.json(); if (cid === activeId.current) setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m])); loadConvs(); }
    else { setErr("Pesan gagal terkirim"); setText(body); setAiWait((w) => w.filter((x) => x !== cid)); }
    requestAnimationFrame(() => { if (ta.current) ta.current.style.height = "auto"; });
  }

  async function showInfo() {
    if (!active) return;
    setInfo(true);
    if (active.kind !== "ai") {
      const r = await fetch(`/api/members?conversationId=${active.id}`);
      if (r.ok) setMembers(await r.json());
    }
  }

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return convs.filter((c) => {
      if (c.kind !== "ai" && tab === "dm" && c.kind !== "dm") return false;
      if (c.kind !== "ai" && tab === "group" && c.kind === "dm") return false;
      if (c.kind === "ai" && tab !== "all") return false;
      if (!s) return true;
      return convName(c).toLowerCase().includes(s) || (c.other_username ?? "").includes(s);
    });
  }, [convs, q, tab]);

  const subtitle = (c: Conv) =>
    c.kind === "dm" ? `@${c.other_username}` : c.kind === "ai" ? "Asisten AI · selalu online" : `${c.member_count} anggota`;
  const preview = (c: Conv) => {
    if (!c.last_body) return c.kind === "ai" ? "Tanya apa saja ke Kev-Ai" : "Belum ada pesan";
    const who = c.last_kind === "ai" ? "Kev-Ai" : c.last_username === me.username ? "Kamu" : c.last_username;
    return c.kind === "dm" || c.kind === "ai" ? (c.last_username === me.username ? `Kamu: ${c.last_body}` : c.last_body) : `${who}: ${c.last_body}`;
  };

  const waiting = active && aiWait.includes(active.id);

  return (
    <div className="app" data-chat={active ? "open" : "list"}>
      <aside className="side">
        <header className="bar">
          <div className="brand"><Logo /><div><strong>kevsoft-chat</strong><small>@{me.username}</small></div></div>
          <div className="bar-actions">
            <button className="icon-btn" onClick={() => setShowNew(true)} aria-label="Chat baru"><Icon n="edit" /></button>
            <Account name={me.name} username={me.username} avatar={me.avatarUrl} />
          </div>
        </header>
        <div className="search"><Icon n="search" size={18} /><input placeholder="Cari chat" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari chat" /></div>
        <div className="tabs">
          {([["all", "Semua"], ["dm", "Pribadi"], ["group", "Grup"]] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <ul className="convs">
          {list.length === 0 && <li className="empty">Tidak ada chat. Tekan ✎ untuk mulai chat atau buat grup.</li>}
          {list.map((c) => (
            <li key={c.id}>
              <button className={`conv${active?.id === c.id ? " on" : ""}${c.kind === "ai" ? " ai" : ""}`} onClick={() => open(c)}>
                <Avatar name={convName(c)} src={c.other_avatar} kind={c.kind === "dm" ? undefined : c.kind} />
                <span className="meta">
                  <span className="row">
                    <b>{convName(c)}{c.kind === "ai" && <em className="badge">AI</em>}</b>
                    {c.last_at && <small className={c.unread ? "hot" : ""}>{listTime(c.last_at)}</small>}
                  </span>
                  <span className="row">
                    <span className="preview">{preview(c)}</span>
                    {c.unread > 0 && <span className="count">{c.unread_mention && <i>@</i>}{c.unread > 99 ? "99+" : c.unread}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="main">
        {active ? (
          <>
            <header className="bar">
              <button className="icon-btn back" onClick={() => { setActive(null); activeId.current = null; }} aria-label="Kembali"><Icon n="back" /></button>
              <button className="who" onClick={showInfo}>
                <Avatar name={convName(active)} src={active.other_avatar} kind={active.kind === "dm" ? undefined : active.kind} size={42} />
                <div><strong>{convName(active)}</strong><small>{waiting ? "sedang mengetik…" : subtitle(active)}</small></div>
              </button>
              <button className="icon-btn" onClick={showInfo} aria-label="Info"><Icon n="info" /></button>
            </header>

            <div className="thread">
              {msgs.length >= 50 && <button className="older" onClick={older}>Muat pesan sebelumnya</button>}
              {active.kind === "ai" && msgs.length === 0 && (
                <div className="hero-note"><Icon n="sparkle" size={28} /><h3>Halo, aku Kev-Ai</h3><p>Tulis pertanyaan apa saja. Di grup atau komunitas, panggil aku dengan <b>@kev-ai</b> diikuti pertanyaanmu.</p></div>
              )}
              {msgs.map((m, i) => {
                const prev = msgs[i - 1];
                const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                const mine = m.sender_id === me.id;
                const first = newDay || !prev || prev.sender_id !== m.sender_id || prev.kind !== m.kind;
                const showName = !mine && first && active.kind !== "dm" && active.kind !== "ai";
                return (
                  <div key={m.id}>
                    {newDay && <div className="day"><span>{dayLabel(m.created_at)}</span></div>}
                    <div className={`msg ${mine ? "mine" : ""} ${m.kind === "ai" ? "ai" : ""} ${first ? "first" : ""}`}>
                      {!mine && active.kind !== "dm" && active.kind !== "ai" && (
                        <span className="msg-av">{first && <Avatar name={m.name || m.username || "?"} src={m.avatar_url} kind={m.kind === "ai" ? "ai" : undefined} size={30} />}</span>
                      )}
                      <div className="bubble">
                        {showName && <span className="sender" style={{ color: m.kind === "ai" ? "var(--violet)" : nameColor(m.username || "") }}>
                          {m.kind === "ai" ? "Kev-Ai" : m.name}<small> @{m.username}</small>{m.kind === "ai" && <em className="badge">AI</em>}
                        </span>}
                        {m.reply_to && (m.reply_body != null) && (
                          <div className="quote"><b>{m.reply_username === me.username ? "Kamu" : m.reply_username === AI_HANDLE ? "Kev-Ai" : `@${m.reply_username}`}</b><span>{m.reply_body}</span></div>
                        )}
                        <span className="text"><Rich body={m.body} mentions={m.mentions} me={me.username} /></span>
                        <span className="foot"><small>{clock(m.created_at)}</small>
                          <button className="reply-btn" onClick={() => { setReplyTo(m); ta.current?.focus(); }} aria-label="Balas"><Icon n="reply" size={14} /></button>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {waiting && <div className="msg ai first"><div className="bubble typing"><i /><i /><i /></div></div>}
              <div ref={bottom} />
            </div>

            <div className="composer-wrap">
              {mentionQ !== null && sugs.length > 0 && (
                <ul className="sugs" role="listbox">
                  {sugs.map((s, i) => (
                    <li key={s.username}>
                      <button role="option" aria-selected={i === sugIdx} className={i === sugIdx ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pick(s); }}>
                        <Avatar name={s.name} src={s.avatar_url} kind={s.ai ? "ai" : undefined} size={32} />
                        <span><b>@{s.username}</b><small>{s.ai ? "Panggil AI. Tulis pertanyaan setelah tag" : s.name}</small></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {replyTo && (
                <div className="replying"><div><b>Membalas {replyTo.sender_id === me.id ? "kamu" : replyTo.kind === "ai" ? "Kev-Ai" : `@${replyTo.username}`}</b><span>{replyTo.body.slice(0, 100)}</span></div>
                  <button className="icon-btn" onClick={() => setReplyTo(null)} aria-label="Batal balas"><Icon n="close" size={18} /></button></div>
              )}
              {aiHint && <div className="ai-hint"><Icon n="sparkle" size={16} /><span>Kev-Ai akan menjawab: <b>{aiPrompt(text) || "tulis pertanyaanmu…"}</b></span></div>}
              {err && <p className="error" role="alert">{err}</p>}
              <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <textarea ref={ta} rows={1} value={text} maxLength={4000} aria-label="Pesan"
                  placeholder={active.kind === "ai" ? "Tanya Kev-Ai apa saja…" : "Ketik pesan, @ untuk tag, @kev-ai untuk AI"}
                  onChange={(e) => { setText(e.target.value); detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
                    e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; }}
                  onKeyDown={onKey}
                  onClick={(e) => detectMention(text, e.currentTarget.selectionStart ?? 0)} />
                <button className="send" disabled={!text.trim()} aria-label="Kirim"><Icon n="send" size={20} /></button>
              </form>
            </div>

            {info && (
              <aside className="info">
                <header><button className="icon-btn" onClick={() => setInfo(false)} aria-label="Tutup"><Icon n="close" /></button><strong>Info</strong></header>
                <div className="info-hero">
                  <Avatar name={convName(active)} src={active.other_avatar} kind={active.kind === "dm" ? undefined : active.kind} size={96} />
                  <h2>{convName(active)}</h2>
                  <p className="muted">{active.kind === "dm" ? `@${active.other_username}` : subtitle(active)}</p>
                  {active.description && <p className="desc">{active.description}</p>}
                  {active.kind === "ai" && <p className="desc">Kev-Ai menjawab lewat kev-ai.vercel.app. Di grup, panggil dengan @kev-ai lalu tulis pertanyaannya.</p>}
                </div>
                {active.kind !== "ai" && (
                  <>
                    <h4>{active.kind === "dm" ? "Anggota" : `${members.length} anggota`}</h4>
                    <ul className="members">
                      {members.map((u) => (
                        <li key={u.id}><Avatar name={u.name || u.username} src={u.avatar_url} size={38} />
                          <span><b>{u.name || u.username}{u.id === me.id && " (kamu)"}</b><small>@{u.username}</small></span>
                          {u.role === "admin" && <em className="badge">admin</em>}</li>
                      ))}
                    </ul>
                  </>
                )}
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
    </div>
  );
}
