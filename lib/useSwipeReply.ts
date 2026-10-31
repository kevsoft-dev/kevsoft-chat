import { useEffect, useRef, type RefObject } from "react";

const START = 10;      // px geser horizontal sebelum dianggap gestur (di bawah ini masih bisa gulir/tekan lama)
const THRESHOLD = 56;  // px sampai "terkunci" (ikon membal, getar singkat)
const MAX = 88;        // batas geser setelah diredam

/**
 * Geser pesan ke kanan untuk membalas (HP / layar sentuh).
 * Tidak memicu render ulang: posisi ditulis langsung ke CSS variable --sx / --sp pada elemen,
 * kelas .swiping .armed .snap .sent mengatur animasinya (lihat globals.css, bagian v35).
 */
export function useSwipeReply(ref: RefObject<HTMLElement | null>, enabled: boolean, onReply: () => void) {
  // onReply dibaca lewat ref supaya listener tidak dipasang ulang tiap render
  const cb = useLatest(onReply);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let id = -1, x0 = 0, y0 = 0;
    let mode: "idle" | "drag" | "skip" = "idle";
    let armed = false;
    let blockClick = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const place = (dx: number) => {
      const raw = Math.max(0, dx - START);
      // setelah threshold gerakan melambat (terasa seperti karet)
      const eased = raw <= THRESHOLD ? raw : THRESHOLD + (raw - THRESHOLD) * 0.3;
      const px = Math.min(MAX, eased);
      el.style.setProperty("--sx", `${px.toFixed(1)}px`);
      el.style.setProperty("--sp", Math.min(1, px / THRESHOLD).toFixed(3));
      const on = raw >= THRESHOLD;
      if (on !== armed) {
        armed = on;
        el.classList.toggle("armed", on);
        if (on) navigator.vibrate?.(10);
      }
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !e.isPrimary) return; // desktop memakai menu pesan
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; mode = "idle";
      el.classList.remove("snap");
    };

    const move = (e: PointerEvent) => {
      if (e.pointerId !== id || mode === "skip") return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (mode === "idle") {
        if (Math.abs(dy) > START && Math.abs(dy) >= Math.abs(dx)) { mode = "skip"; return; } // gulir vertikal
        if (dx > START && dx > Math.abs(dy) * 1.4) {
          mode = "drag";
          try { el.setPointerCapture(id); } catch {}
          el.classList.add("swiping");
        } else return;
      }
      place(dx);
    };

    const end = (e: PointerEvent, cancelled: boolean) => {
      if (e.pointerId !== id) return;
      const wasDrag = mode === "drag";
      id = -1; mode = "idle";
      if (!wasDrag) return;
      const fire = armed && !cancelled;
      armed = false;
      blockClick = true; // jangan ikut menekan tautan/tombol di bawah jari
      timers.push(setTimeout(() => { blockClick = false; }, 350));
      el.classList.remove("swiping", "armed");
      el.classList.add("snap");
      el.style.setProperty("--sx", "0px");
      el.style.setProperty("--sp", "0");
      if (fire) {
        el.classList.add("sent");
        timers.push(setTimeout(() => el.classList.remove("sent"), 520));
        cb.current();
      }
      timers.push(setTimeout(() => el.classList.remove("snap"), 560));
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
    const click = (e: MouseEvent) => { if (blockClick) { e.stopPropagation(); e.preventDefault(); } };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("click", click, true);
      timers.forEach(clearTimeout);
      el.classList.remove("swiping", "armed", "snap", "sent");
    };
  }, [ref, enabled, cb]);
}

function useLatest<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}
