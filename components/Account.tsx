"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar, Icon } from "./ui";
import { useTheme } from "./ThemeToggle";

export default function Account({ name, username, avatar }: { name: string; username?: string; avatar?: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useTheme();
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/sign-in");
  }

  return (
    <div className="account" ref={ref}>
      <button className="account-btn" onClick={() => setOpen((o) => !o)} aria-label="Akun" aria-expanded={open}>
        <Avatar name={name} src={avatar} size={40} />
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <b>{name}</b>
          {username && <small>@{username}</small>}
          <button role="menuitem" className="theme-row" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <Icon n={theme === "dark" ? "sun" : "moon"} size={18} />{theme === "dark" ? "Tema terang" : "Tema gelap"}
          </button>
          <button role="menuitem" onClick={logout}>Keluar</button>
        </div>
      )}
    </div>
  );
}
