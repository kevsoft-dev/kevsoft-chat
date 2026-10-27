"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui";

type Pt = { x: number; y: number };

/**
 * Editor potong foto: geser untuk mengatur posisi, slider / scroll / cubit untuk zoom.
 * Bingkai mengikuti hasil akhir (bulat 1:1 untuk foto profil, lebar 3:1 untuk sampul).
 */
export default function Cropper({ file, aspect, outW, outH, round, title, onCancel, onSave }: {
  file: File; aspect: number; outW: number; outH: number; round?: boolean; title: string;
  onCancel: () => void; onSave: (blob: Blob) => void | Promise<void>;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState({ w: 320, h: 320 / aspect });
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState<Pt>({ x: 0, y: 0 }); // pojok kiri-atas gambar relatif ke bingkai
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pts = useRef(new Map<number, Pt>());
  const last = useRef<{ d: number } | null>(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  // Ukuran bingkai mengikuti lebar layar.
  useEffect(() => {
    const fit = () => {
      const w = Math.max(220, Math.min(560, window.innerWidth - 56, round ? 360 : 560));
      setBox({ w, h: w / aspect });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [aspect, round]);

  const cover = nat ? Math.max(box.w / nat.w, box.h / nat.h) : 1;
  const scale = cover * zoom;

  const clamp = (p: Pt, s: number): Pt => {
    if (!nat) return p;
    const dw = nat.w * s, dh = nat.h * s;
    return { x: Math.min(0, Math.max(box.w - dw, p.x)), y: Math.min(0, Math.max(box.h - dh, p.y)) };
  };

  // Posisi awal: di tengah. Dihitung ulang kalau ukuran bingkai berubah.
  useEffect(() => {
    if (!nat) return;
    const s = cover * zoom;
    setPos((p) => (p.x === 0 && p.y === 0 && zoom === 1 ? { x: (box.w - nat.w * s) / 2, y: (box.h - nat.h * s) / 2 } : clamp(p, s)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nat, box.w, box.h]);

  function setZoomAt(z: number, anchor?: Pt) {
    if (!nat) return;
    const nz = Math.min(4, Math.max(1, z));
    const a = anchor ?? { x: box.w / 2, y: box.h / 2 };
    const ix = (a.x - pos.x) / scale, iy = (a.y - pos.y) / scale; // titik gambar di bawah anchor
    const ns = cover * nz;
    setZoom(nz);
    setPos(clamp({ x: a.x - ix * ns, y: a.y - iy * ns }, ns));
  }

  const rel = (e: React.PointerEvent | React.WheelEvent): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last.current = null;
  }
  function move(e: React.PointerEvent) {
    const prev = pts.current.get(e.pointerId);
    if (!prev || !nat) return;
    const cur = { x: e.clientX, y: e.clientY };
    pts.current.set(e.pointerId, cur);
    if (pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (last.current && last.current.d > 0) {
        const r = stageRef.current!.getBoundingClientRect();
        setZoomAt(zoom * (d / last.current.d), { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top });
      }
      last.current = { d };
      return;
    }
    setPos((p) => clamp({ x: p.x + (cur.x - prev.x), y: p.y + (cur.y - prev.y) }, scale));
  }
  function up(e: React.PointerEvent) { pts.current.delete(e.pointerId); last.current = null; }
  function wheel(e: React.WheelEvent) { setZoomAt(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), rel(e)); }

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onCancel]);

  async function save() {
    const img = imgRef.current;
    if (!img || !nat) return;
    setBusy(true); setErr("");
    try {
      const cv = document.createElement("canvas");
      cv.width = outW; cv.height = outH;
      const ctx = cv.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, -pos.x / scale, -pos.y / scale, box.w / scale, box.h / scale, 0, 0, outW, outH);
      let blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/webp", 0.82));
      if (!blob || blob.type !== "image/webp") blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/jpeg", 0.85));
      if (!blob) throw new Error("Gagal memproses foto");
      await onSave(blob);
    } catch (e: any) {
      setErr(e?.message || "Gagal memproses foto");
      setBusy(false);
    }
  }

  return (
    <div className="modal-bg crop-bg" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal crop-modal">
        <header><h2>{title}</h2></header>
        <div
          ref={stageRef}
          className={`crop-stage${round ? " round" : ""}`}
          style={{ width: box.w, height: box.h }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}
        >
          <img
            ref={imgRef} src={url} alt="" draggable={false}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setErr("Gambar tidak bisa dibuka")}
            style={nat ? { width: nat.w * scale, height: nat.h * scale, transform: `translate(${pos.x}px, ${pos.y}px)` } : { opacity: 0 }}
          />
          <span className="crop-mask" aria-hidden />
        </div>
        <p className="muted small crop-hint">Geser untuk mengatur posisi · cubit atau gunakan slider untuk zoom</p>
        <label className="crop-zoom">
          <Icon n="minus" size={16} />
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomAt(Number(e.target.value))} aria-label="Zoom" />
          <Icon n="plus" size={16} />
        </label>
        {err && <p className="error">{err}</p>}
        <div className="crop-actions">
          <button type="button" onClick={onCancel} disabled={busy}>Batal</button>
          <button type="button" className="primary" onClick={save} disabled={busy || !nat}>{busy ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </div>
    </div>
  );
}
