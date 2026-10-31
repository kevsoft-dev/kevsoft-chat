"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar, Icon, QUICK_REACTIONS, type IconName, type Reaction } from "./ui";

export type MenuItem = { icon: IconName; label: string; run: () => void; danger?: boolean };
export type DialogAction = { label: string; run: () => void; danger?: boolean };

// Menu konteks: popover di desktop, bottom sheet di HP.
export type MenuReactions = { current: string | null; onPick: (emoji: string) => void; onMore: () => void };

export function Menu({ x, y, items, reactions, onClose }: { x: number; y: number; items: MenuItem[]; reactions?: MenuReactions; onClose: () => void }) {
  const t0 = useRef(performance.now());
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="menu-bg" onClick={() => { if (performance.now() - t0.current > 350) onClose(); }}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className={`menu${reactions ? " has-react" : ""}`} role="menu" style={{ "--x": `${x}px`, "--y": `${y}px` } as React.CSSProperties}>
        {reactions && (
          <div className="react-bar" role="group" aria-label="Beri reaksi">
            {QUICK_REACTIONS.map((e) => (
              <button key={e} type="button" className={e === reactions.current ? "on" : ""} aria-label={`Reaksi ${e}`}
                onClick={() => { onClose(); reactions.onPick(e); }}>{e}</button>
            ))}
            <button type="button" className="more" aria-label="Pilih emoji lain" onClick={() => { onClose(); reactions.onMore(); }}>
              <Icon n="plus" size={20} />
            </button>
          </div>
        )}
        {items.map((it) => (
          <button key={it.label} role="menuitem" className={it.danger ? "danger" : ""} onClick={() => { onClose(); it.run(); }}>
            <Icon n={it.icon} size={18} />{it.label}
          </button>
        ))}
      </div>
    </>
  );
}

// Dialog konfirmasi kecil di tengah layar.
export function Dialog({ title, text, actions, onClose }: { title: string; text?: string; actions: DialogAction[]; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-bg center" onClick={onClose}>
      <div className="dialog" role="alertdialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {text && <p>{text}</p>}
        <div className="acts">
          {actions.map((a) => (
            <button key={a.label} className={a.danger ? "danger" : ""} onClick={() => { onClose(); a.run(); }}>{a.label}</button>
          ))}
          <button className="cancel" onClick={onClose}>Batal</button>
        </div>
      </div>
    </div>
  );
}

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon n="close" /></button>
      <img src={src} alt="Foto profil" referrerPolicy="no-referrer" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// Pilihan emoji lengkap untuk tombol "+" di bar reaksi.
const EMOJI_GROUPS: { name: string; list: string[] }[] = [
  { name: "Wajah", list: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤗 🤭 🤔 🤨 😐 😑 😶 🙄 😏 😬 😌 😔 😪 😴 🤤 😷 🤒 🤕 🤢 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖".split(" ") },
  { name: "Tangan", list: "👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 👏 🙌 👐 🤲 💪 ✍️ 🫶 🫡".split(" ") },
  { name: "Hati", list: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 ✨ 🔥 ⭐ 🌟".split(" ") },
  { name: "Lainnya", list: "🎉 🎊 🎁 🏆 🥇 ⚽ 🏀 🎮 🎵 🎶 📷 💻 📱 💡 📌 ✅ ❌ ⚠️ ❓ ❗ 💬 👀 🧠 🌈 ☀️ 🌙 🌧️ ⚡ ❄️ 🍕 🍔 🍟 🍜 🍰 ☕ 🍺 🐶 🐱 🐻 🦊 🐸 🐧 🚀 ✈️ 🚗 🏠 🇮🇩".split(" ") },
];

export function EmojiPicker({ current, onPick, onClose }: { current: string | null; onPick: (emoji: string) => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal emoji-pick" role="dialog" aria-label="Pilih emoji" onClick={(e) => e.stopPropagation()}>
        <header><h2>Reaksi</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon n="close" /></button>
        </header>
        <div className="emoji-scroll">
          {EMOJI_GROUPS.map((g) => (
            <section key={g.name}>
              <h4>{g.name}</h4>
              <div className="emoji-grid">
                {g.list.map((e) => (
                  <button key={e} type="button" className={e === current ? "on" : ""} aria-label={e}
                    onClick={() => { onClose(); onPick(e); }}>{e}</button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// Daftar siapa saja yang bereaksi (ketuk reaksi di bawah gelembung). Baris milik sendiri bisa diketuk untuk menghapus.
export function ReactionSheet({ reactions, meUsername, onRemove, onClose }: {
  reactions: Reaction[]; meUsername: string; onRemove: () => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<string>("all");
  const total = reactions.reduce((n, r) => n + r.u.length, 0);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => { if (!total) onClose(); }, [total, onClose]);
  const rows = (tab === "all" ? reactions : reactions.filter((r) => r.e === tab))
    .flatMap((r) => r.u.map((x) => ({ ...x, e: r.e })));
  // Reaksi saya tampil paling atas.
  rows.sort((a, b) => Number(b.u === meUsername) - Number(a.u === meUsername));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal react-sheet" role="dialog" aria-label="Reaksi pesan" onClick={(e) => e.stopPropagation()}>
        <header><h2>{total} reaksi</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon n="close" /></button>
        </header>
        <div className="react-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>Semua {total}</button>
          {reactions.map((r) => (
            <button key={r.e} role="tab" aria-selected={tab === r.e} className={tab === r.e ? "on" : ""} onClick={() => setTab(r.e)}>{r.e} {r.u.length}</button>
          ))}
        </div>
        <ul className="react-list">
          {rows.map((x) => {
            const me = x.u === meUsername;
            return (
              <li key={x.u + x.e}>
                <button type="button" disabled={!me} onClick={() => { onClose(); onRemove(); }}>
                  <Avatar name={x.n || x.u} size={36} />
                  <span className="who"><b>{me ? "Kamu" : x.n}</b>{me ? <small>Ketuk untuk menghapus</small> : <small>@{x.u}</small>}</span>
                  <span className="em">{x.e}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
