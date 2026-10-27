"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AI_HANDLE, aiPrompt, parseMentions } from "@/lib/mentions";
import { readPref } from "@/lib/prefs";
import { Avatar, Icon, type Msg, type UserLite } from "./ui";

type Sug = { username: string; name: string; avatar_url: string | null; ai?: boolean };

export default function Composer({ convId, kind, me, replyTo, onCancelReply, onSend, onSendMedia, onSendPoll, taRef }: {
  convId: string; kind: string; me: string; replyTo: Msg | null;
  onCancelReply: () => void; onSend: (body: string) => void;
  onSendMedia?: (file: File, caption: string) => void;
  onSendPoll?: (question: string, options: string[]) => void;
  taRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [text, setText] = useState("");
  const textRef = useRef(""); textRef.current = text;
  const drafts = useRef<Record<string, string>>({});
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [sugIdx, setSugIdx] = useState(0);
  const [mentionQ, setMentionQ] = useState<string | null>(null);

  // Lampiran: preview + caption (ala WhatsApp)
  const [attach, setAttach] = useState<{ file: File; url: string; isImage: boolean } | null>(null);
  const [caption, setCaption] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pq, setPq] = useState("");
  const [popts, setPopts] = useState(["", ""]);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(drafts.current[convId] ?? "");
    setMentionQ(null);
    setAttach((a) => { if (a) URL.revokeObjectURL(a.url); return null; });
    setCaption("");
    setMenuOpen(false);
    setPollOpen(false);
    if (!("ontouchstart" in window)) taRef.current?.focus();
    return () => { drafts.current[convId] = textRef.current; };
  }, [convId, taRef]);

  useLayoutEffect(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [text, taRef]);

  useEffect(() => () => { if (attach) URL.revokeObjectURL(attach.url); }, [attach]);

  function detect(value: string, caret: number) {
    const m = /(^|[^a-z0-9_.@-])@([a-z0-9_.-]{0,20})$/i.exec(value.slice(0, caret));
    setMentionQ(m ? m[2].toLowerCase() : null); setSugIdx(0);
  }

  useEffect(() => {
    if (mentionQ === null) { setSugs([]); return; }
    const ai: Sug[] = kind !== "ai" && AI_HANDLE.startsWith(mentionQ)
      ? [{ username: AI_HANDLE, name: "Kev-Ai", avatar_url: null, ai: true }] : [];
    let dead = false;
    const t = setTimeout(async () => {
      let users: Sug[] = [];
      if (kind !== "ai") {
        try {
          const r = await fetch(`/api/users?q=${encodeURIComponent(mentionQ)}&cid=${convId}`);
          if (r.ok) users = (await r.json()).map((u: UserLite) => ({
            username: u.username, name: u.name || u.username, avatar_url: u.avatar_url,
          }));
        } catch {}
      }
      if (!dead) setSugs([...ai, ...users]);
    }, 120);
    if (ai.length) setSugs(ai);
    return () => { dead = true; clearTimeout(t); };
  }, [mentionQ, kind, convId]);

  function pick(s: Sug) {
    const el = taRef.current; if (!el) return;
    const caret = el.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@[a-z0-9_.-]*$/i, `@${s.username} `);
    setText(before + text.slice(caret)); setMentionQ(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); });
  }

  function submit() {
    if (attach) {
      onSendMedia?.(attach.file, caption.trim());
      URL.revokeObjectURL(attach.url);
      setAttach(null); setCaption("");
      return;
    }
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText(""); setMentionQ(null); drafts.current[convId] = "";
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQ !== null && sugs.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSugIdx((i) => (i + 1) % sugs.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSugIdx((i) => (i - 1 + sugs.length) % sugs.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(sugs[sugIdx]); return; }
      if (e.key === "Escape") { setMentionQ(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window) && readPref("enter", true)) {
      e.preventDefault(); submit();
    }
  }

  function takeFile(f: File | undefined) {
    if (!f) return;
    if (/zip/i.test(f.name) || /zip|compressed/.test(f.type)) return;
    if (f.size > 400_000) return;
    const isImage = f.type.startsWith("image/");
    setAttach({ file: f, url: URL.createObjectURL(f), isImage });
    setCaption(text.trim());
    setMenuOpen(false);
    setPollOpen(false);
  }

  const aiHint = useMemo(() => kind !== "ai" && parseMentions(text).includes(AI_HANDLE), [text, kind]);
  const has = attach ? true : text.trim().length > 0;

  // —— Preview lampiran (caption di bawah, kirim di sini) ——
  if (attach) {
    return (
      <div className="composer-wrap attach-sheet">
        <div className="attach-preview">
          <button type="button" className="icon-btn attach-x" aria-label="Batal"
            onClick={() => { URL.revokeObjectURL(attach.url); setAttach(null); setCaption(""); }}>
            <Icon n="close" size={20} />
          </button>
          {attach.isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attach.url} alt="" className="attach-img" />
          ) : (
            <div className="attach-file">
              <Icon n="info" size={28} />
              <span>{attach.file.name}</span>
              <small>{Math.round(attach.file.size / 1024)} KB</small>
            </div>
          )}
          <div className="attach-cap">
            <input
              className="attach-input"
              placeholder="Tambah caption…"
              value={caption}
              maxLength={4000}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              autoFocus
            />
            <button type="button" className="send ready" aria-label="Kirim" onClick={submit}>
              <Icon n="send" size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="composer-wrap">
      {mentionQ !== null && sugs.length > 0 && (
        <ul className="sugs" role="listbox">
          {sugs.map((s, i) => (
            <li key={s.username}>
              <button role="option" aria-selected={i === sugIdx} className={i === sugIdx ? "on" : ""}
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}>
                <Avatar name={s.name} src={s.avatar_url} kind={s.ai ? "ai" : undefined} size={32} />
                <span><b>@{s.username}</b><small>{s.ai ? "Panggil AI" : s.name}</small></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {replyTo && (
        <div className="replying">
          <div>
            <b>Membalas {replyTo.username === me ? "kamu" : replyTo.kind === "ai" ? "Kev-Ai" : `@${replyTo.username}`}</b>
            <span>{replyTo.body.slice(0, 100)}</span>
          </div>
          <button className="icon-btn" onClick={onCancelReply} aria-label="Batal balas"><Icon n="close" size={18} /></button>
        </div>
      )}
      {aiHint && (
        <div className="ai-hint"><Icon n="sparkle" size={16} /><span>Kev-Ai: <b>{aiPrompt(text) || "…"}</b></span></div>
      )}

      {pollOpen && (
        <div className="poll-sheet">
          <div className="poll-head">
            <strong>Polling</strong>
            <button type="button" className="icon-btn" onClick={() => setPollOpen(false)} aria-label="Tutup"><Icon n="close" size={18} /></button>
          </div>
          <input className="poll-q" placeholder="Tanya apa?" value={pq} maxLength={200} onChange={(e) => setPq(e.target.value)} autoFocus />
          {popts.map((o, i) => (
            <input key={i} className="poll-o" placeholder={`Opsi ${i + 1}`} value={o} maxLength={80}
              onChange={(e) => setPopts((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          <div className="poll-bar">
            {popts.length < 6 && (
              <button type="button" className="link" onClick={() => setPopts((a) => [...a, ""])}>+ Opsi</button>
            )}
            <button
              type="button"
              className="poll-go"
              disabled={!pq.trim() || popts.filter((x) => x.trim()).length < 2}
              onClick={() => {
                const opts = popts.map((x) => x.trim()).filter(Boolean);
                if (pq.trim() && opts.length >= 2) {
                  onSendPoll?.(pq.trim(), opts);
                  setPq(""); setPopts(["", ""]); setPollOpen(false);
                }
              }}
            >Kirim</button>
          </div>
        </div>
      )}

      {menuOpen && kind !== "ai" && (
        <div className="attach-menu">
          <button type="button" onClick={() => { setMenuOpen(false); imgRef.current?.click(); }}>
            <span className="am-ico img">🖼</span> Galeri
          </button>
          <button type="button" onClick={() => { setMenuOpen(false); fileRef.current?.click(); }}>
            <span className="am-ico doc">📄</span> Dokumen
          </button>
          <button type="button" onClick={() => { setMenuOpen(false); setPollOpen(true); }}>
            <span className="am-ico poll">📊</span> Polling
          </button>
        </div>
      )}

      <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {kind !== "ai" && (
          <button type="button" className={`icon-btn attach${menuOpen ? " on" : ""}`}
            aria-label="Lampirkan" onClick={() => setMenuOpen((o) => !o)}>
            <Icon n="plus" size={22} />
          </button>
        )}
        <input ref={imgRef} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={fileRef} type="file" hidden accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,application/pdf,text/plain"
          onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }} />
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          maxLength={4000}
          aria-label="Pesan"
          placeholder="Ketik Pesan"
          onChange={(e) => { setText(e.target.value); detect(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
          onKeyDown={onKey}
          onClick={(e) => detect(text, e.currentTarget.selectionStart ?? 0)}
        />
        <button className={`send${has ? " ready" : ""}`} disabled={!has} aria-label="Kirim"
          onPointerDown={(e) => e.preventDefault()}>
          <Icon n="send" size={20} />
        </button>
      </form>
    </div>
  );
}
