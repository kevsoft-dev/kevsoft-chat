"use client";
import { useEffect, useState } from "react";
import { Icon } from "./ui";

type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"); }, []);
  const set = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("kc_theme", t); } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#f1f1eb" : "#090a0e");
    setTheme(t);
  };
  return [theme, set] as const;
}

export default function ThemeToggle({ className = "icon-btn" }: { className?: string }) {
  const [theme, set] = useTheme();
  return (
    <button className={className} onClick={() => set(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Ganti ke tema terang" : "Ganti ke tema gelap"} title={theme === "dark" ? "Tema terang" : "Tema gelap"}>
      <Icon n={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
