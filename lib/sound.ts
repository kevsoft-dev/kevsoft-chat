// Bunyi notifikasi kecil lewat WebAudio (tanpa file audio, jadi ringan).
let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch {}
}

export function blip(kind: "in" | "out" = "in") {
  if (!ctx || ctx.state !== "running") return;
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  const [a, b] = kind === "in" ? [880, 1320] : [620, 820];
  o.type = "sine";
  o.frequency.setValueAtTime(a, t);
  o.frequency.exponentialRampToValueAtTime(b, t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(kind === "in" ? 0.12 : 0.05, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.17);
}
