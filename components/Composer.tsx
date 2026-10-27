"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AI_HANDLE, aiPrompt, parseMentions } from "@/lib/mentions";
import { readPref } from "@/lib/prefs";
import { Avatar, Icon, type Msg, type UserLite } from "./ui";

type Sug = { username: string; name: string; avatar_url: string | null; ai?: boolean };

// Teks pesan disimpan di sini (bukan di Chat), jadi mengetik tidak me-render ulang seluruh daftar pesan.
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
  const [pollOpen, setPollOpen] = useState(false);
  const [pq, setPq] = useState("");
  const [popts, setPopts] = useState(["", ""]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Draf tersimpan per chat (pindah chat tidak menghapus ketikan).
  useEffect(() => {
    setText(drafts.current[convId] ?? ""); setMentionQ(null);
    if (!("ontouchstart" in window)) taRef.current?.focus();
    return () => { drafts.current[convId] = textRef.current; };
  }, [convId, taRef]);

  useLayoutEffect(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [text, taRef]);

  function detect(value: string, caret: number) {
    const m = /(^|[^a-z0-9_.@-])@([a-z0-9_.-]{0,20})$/i.exec(value.slice(0, caret));
    setMentionQ(m ? m[2].toLowerCase() : null); setSugIdx(0);
  }

  useEffect(() => {
    if (mentionQ === null) { setSugs([]); return; }
    const ai: Sug[] = kind !== "ai" && AI_HANDLE.startsWith(mentionQ) ? [{ username: AI_HANDLE, name: "Kev-Ai", avatar_url: null, ai: true }] : [];
    let dead = false;
    const t = setTimeout(async () => {
      let users: Sug[] = [];
      if (kind !== "ai") {
        try {
          const r = await fetch(`/api/users?q=${encodeURIComponent(mentionQ)}&cid=${convId}`);
          if (r.ok) users = (await r.json()).map((u: UserLite) => ({ username: u.username, name: u.name || u.username, avatar_url: u.avatar_url }));
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
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window) && readPref("enter", true)) { e.preventDefault(); submit(); }
  }

  const aiHint = useMemo(() => kind !== "ai" && parseMentions(text).includes(AI_HANDLE), [text, kind]);
  const has = text.trim().length > 0;

  return (
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
        <div className="replying">
          <div><b>Membalas {replyTo.sender_id && replyTo.username === me ? "kamu" : replyTo.kind === "ai" ? "Kev-Ai" : `@${replyTo.username}`}</b><span>{replyTo.body.slice(0, 100)}</span></div>
          <button className="icon-btn" onClick={onCancelReply} aria-label="Batal balas"><Icon n="close" size={18} /></button>
        </div>
      )}
      {aiHint && <div className="ai-hint"><Icon n="sparkle" size={16} /><span>Kev-Ai akan menjawab: <b>{aiPrompt(text) || "tulis pertanyaanmu…"}</b></span></div>}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {kind !== "ai" && (
          <>
            <button type="button" className="icon-btn attach" aria-label="Lampirkan" onClick={() => fileRef.current?.click()}>
              <Icon n="plus" size={22} />
            </button>
            <input ref={fileRef} type="file" hidden accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,application/pdf,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (f && onSendMedia) onSendMedia(f, text.trim());
                setText(""); drafts.current[convId] = "";
              }} />
            <button type="button" className="icon-btn attach" aria-label="Buat polling" title="Polling"
              onClick={() => setPollOpen((o) => !o)}>
              <Icon n="info" size={20} />
            </button>
          </>
        )}
        <textarea ref={taRef} rows={1} value={text} maxLength={4000} aria-label="Pesan"
          placeholder={kind === "ai" ? "Tanya Kev-Ai apa saja…" : "Ketik Pesan"}
          onChange={(e) => { setText(e.target.value); detect(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
          onKeyDown={onKey}
          onClick={(e) => detect(text, e.currentTarget.selectionStart ?? 0)} />
        <button className={`send${has ? " ready" : ""}`} disabled={!has} aria-label="Kirim"
          onPointerDown={(e) => e.preventDefault()}>
          <Icon n="send" size={20} />
        </button>
      </form>
      {pollOpen && (
        <div className="poll-form">
          <input className="field" placeholder="Pertanyaan polling" value={pq} maxLength={200} onChange={(e) => setPq(e.target.value)} />
          {popts.map((o, i) => (
            <input key={i} className="field" placeholder={`Opsi ${i + 1}`} value={o} maxLength={80}
              onChange={(e) => setPopts((arr) => arr.map((x, j) => j === i ? e.target.value : x))} />
          ))}
          <div className="poll-actions">
            {popts.length < 6 && <button type="button" className="link" onClick={() => setPopts((a) => [...a, ""])}>+ Opsi</button>}
            <button type="button" className="primary" disabled={!pq.trim() || popts.filter((x) => x.trim()).length < 2}
              onClick={() => {
                const opts = popts.map((x) => x.trim()).filter(Boolean);
                if (pq.trim() && opts.length >= 2 && onSendPoll) {
                  onSendPoll(pq.trim(), opts);
                  setPq(""); setPopts(["", ""]); setPollOpen(false);
                }
              }}>Kirim polling</button>
            <button type="button" className="link" onClick={() => setPollOpen(false)}>Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}
