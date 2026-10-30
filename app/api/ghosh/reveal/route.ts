import { sql } from "@/lib/db";
import { limit, tooMany } from "@/lib/ratelimit";
import { deny, member, out } from "@/lib/ghosh";

export const dynamic = "force-dynamic";

// "Kenalkan diri": orang ini akan melihat nama asli kamu (bukan Unknown{nomor}). Hanya untuk SATU orang,
// hanya lewat chat pribadi yang sudah ada, dan bisa dicabut (yang sudah terlanjur dilihat tidak bisa ditarik).
export async function POST(req: Request) {
  const g = await member();
  if (!g) return deny();
  const rl = await limit(`ghrev:${g.actor.id}`, 30, 600);
  if (!rl.ok) return tooMany(rl);
  const b = (await req.json().catch(() => null)) as { num?: number; on?: boolean } | null;
  const num = Number(b?.num);
  if (!Number.isInteger(num)) return out({ error: "Bad request" }, 400);
  const [t] = await sql`select tag from ghosh_alias where num = ${num}`;
  if (!t || t.tag === g.tag) return out({ error: "Unknown itu tidak ditemukan" }, 404);
  const [x, y] = [g.tag, String(t.tag)].sort();
  const [dm] = await sql`select 1 as ok from ghosh_rooms where kind = 'dm' and a_tag = ${x} and b_tag = ${y}`;
  if (!dm) return out({ error: "Buka chat pribadi dulu" }, 400);
  if (b?.on === false) await sql`delete from ghosh_reveals where from_tag = ${g.tag} and to_tag = ${t.tag}`;
  else await sql`
    insert into ghosh_reveals (from_tag, to_tag, from_user_id) values (${g.tag}, ${t.tag}, ${g.actor.id})
    on conflict (from_tag, to_tag) do update set from_user_id = excluded.from_user_id, at = now()`;
  return out({ ok: true, revealed: b?.on !== false });
}
