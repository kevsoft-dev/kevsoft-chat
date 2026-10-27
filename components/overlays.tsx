"use client";
import { useEffect, useRef } from "react";
import { Icon, type IconName } from "./ui";

export type MenuItem = { icon: IconName; label: string; run: () => void; danger?: boolean };
export type DialogAction = { label: string; run: () => void; danger?: boolean };

// Menu konteks: popover di desktop, bottom sheet di HP.
export function Menu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
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
      <div className="menu" role="menu" style={{ "--x": `${x}px`, "--y": `${y}px` } as React.CSSProperties}>
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
