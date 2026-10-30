import { sql } from "@/lib/db";
import { limit, tooMany } from "@/lib/ratelimit";
import { audit, cleanText, gate, out } from "@/lib/ghosh";

export const dynamic = "force-dynamic";

// Minta bergabung: status pending sampai owner utama menyetujui.
export async function POST(req: Request) {
  const g = await gate();
  if (!g) return out({ error: "Unauthorized" }, 401);
  if (g.root || g.status === "approved") return out({ ok: true, state: "approved" });
  if (g.status === "pending") return out({ ok: true, state: "pending" });
  if (g.status === "rejected" || g.status === "revoked") return out({ error: "Permintaan tidak dapat diajukan lagi.", state: g.status }, 403);
  const rl = await limit(`ghreq:${g.actor.id}`, 3, 3600);
  if (!rl.ok) return tooMany(rl, "Terlalu sering. Coba lagi nanti.");
  const body = await req.json().catch(() => ({}));
  const note = cleanText((body as any)?.note, 140) || null;
  await sql`
    insert into ghosh_access (email, user_id, status, note) values (${g.email}, ${g.actor.id}, 'pending', ${note})
    on conflict (email) do nothing`;
  await audit("system", "request", g.email, note);
  return out({ ok: true, state: "pending" });
}
