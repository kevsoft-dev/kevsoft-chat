import { gate, out, onlineCount } from "@/lib/ghosh";

export const dynamic = "force-dynamic";

// Status akses milik pengguna yang sedang login. Tidak membocorkan isi ruang.
export async function GET() {
  const g = await gate();
  if (!g) return out({ error: "Unauthorized" }, 401);
  const inside = g.root || (g.status === "approved" && !g.lockdown);
  return out({
    state: g.root ? "root" : g.lockdown && g.status === "approved" ? "lockdown" : g.status,
    root: g.root,
    online: inside ? await onlineCount() : null,
  });
}
