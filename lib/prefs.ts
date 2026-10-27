"use client";
import { useCallback, useEffect, useState } from "react";

// Preferensi lokal (disimpan di browser): sound, enter (Enter = kirim), motion (animasi).
export function readPref(key: string, def: boolean) {
  try {
    const v = localStorage.getItem("kc_" + key);
    return v === null ? def : v === "1";
  } catch { return def; }
}

export function usePref(key: string, def: boolean) {
  const [v, setV] = useState(def);
  useEffect(() => setV(readPref(key, def)), [key, def]);
  const set = useCallback((n: boolean) => {
    setV(n);
    try { localStorage.setItem("kc_" + key, n ? "1" : "0"); } catch {}
    if (key === "motion") document.documentElement.dataset.motion = n ? "on" : "off";
  }, [key]);
  return [v, set] as const;
}
