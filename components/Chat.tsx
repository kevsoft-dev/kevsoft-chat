"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";
import { UserButton } from "@clerk/nextjs";

type Conv = { id: string; name: string; email: string; last_body: string | null; last_at: string | null };
type Msg = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };

const time = (d: string) => new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

export default function Chat({ me, pusherKey, pusherCluster }: { me: string; pusherKey: string; pusherCluster: string }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const activeId = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async () => {
    const r = await fetch("/api/conversations");
    if (r.ok) setConvs(await r.json());
  }, []);

  useEffect(() => {
    loadConvs();
    const pusher = new Pusher(pusherKey, {
      cluster: pusherCluster,
      channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
    });
    pusher.subscribe(`private-user-${me}`).bind("message", (m: Msg) => {
      if (m.conversation_id === activeId.current)
        setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
      loadConvs();
    });
    return () => { pusher.disconnect(); };
  }, [me, loadConvs, pusherKey, pusherCluster]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  async function open(c: Conv) {
    setActive(c); activeId.current = c.id; setMsgs([]);
    const r = await fetch(`/api/messages?conversationId=${c.id}`);
    if (r.ok) setMsgs(await r.json());
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !active) return;
    setText("");
    const r = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: active.id, body }) });
    if (r.ok) { const m: Msg = await r.json(); setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m])); loadConvs(); }
    else setErr("Pesan gagal terkirim");
  }

  async function newChat(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const r = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const d = await r.json();
    if (!r.ok) return setErr(d.error || "Gagal memulai chat");
    setEmail(""); await loadConvs();
    const list: Conv[] = await (await fetch("/api/conversations")).json();
    const c = list.find((x) => x.id === d.id); if (c) open(c);
  }

  return (
    <div className="app" data-chat={active ? "open" : "list"}>
      <aside className="side">
        <header className="bar"><strong>Obrolan</strong><UserButton /></header>
        <form className="new" onSubmit={newChat}>
          <input type="email" required placeholder="Mulai chat: email teman" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email teman" />
          <button aria-label="Mulai chat">Mulai</button>
        </form>
        {err && <p className="error" role="alert">{err}</p>}
        <ul className="convs">
          {convs.length === 0 && <li className="empty">Belum ada chat. Masukkan email teman yang sudah mendaftar.</li>}
          {convs.map((c) => (
            <li key={c.id}>
              <button className={active?.id === c.id ? "conv on" : "conv"} onClick={() => open(c)}>
                <span className="avatar">{c.name[0]?.toUpperCase()}</span>
                <span className="meta">
                  <span className="row"><b>{c.name}</b>{c.last_at && <small>{time(c.last_at)}</small>}</span>
                  <span className="preview">{c.last_body ?? "Belum ada pesan"}</span>
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
              <button className="back" onClick={() => { setActive(null); activeId.current = null; }} aria-label="Kembali">‹</button>
              <span className="avatar">{active.name[0]?.toUpperCase()}</span>
              <div><strong>{active.name}</strong><small>{active.email}</small></div>
            </header>
            <div className="thread">
              {msgs.map((m) => (
                <div key={m.id} className={m.sender_id === me ? "bubble mine" : "bubble"}>
                  <span className="text">{m.body}</span><small>{time(m.created_at)}</small>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            <form className="composer" onSubmit={send}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ketik pesan" maxLength={4000} aria-label="Pesan" />
              <button disabled={!text.trim()}>Kirim</button>
            </form>
          </>
        ) : (
          <div className="blank"><h2>Pilih percakapan</h2><p className="muted">Atau mulai chat baru dengan email teman.</p></div>
        )}
      </section>
    </div>
  );
}
