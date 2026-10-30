import { sql } from "@/lib/db";
import { limit, tooMany } from "@/lib/ratelimit";
import { deny, member, out } from "@/lib/ghosh";

export const dynamic = "force-dynamic";

// Buka chat pribadi dengan "Unknown{nomor}". Dua orang hanya punya satu chat pribadi.
export async function POST(req: Request) {
  const g = await member();
  if (!g) return deny();
  const rl = await limit(`ghdm:${g.actor.id}`, 20, 600);
  if (!rl.ok) return tooMany(rl);
  const b = (await req.json().catch(() => null)) as { num?: number } | null;
  const num = Number(b?.num);
  if (!Number.isInteger(num) || num < 1000 || num > 99999) return out({ error: "Bad request" }, 400);
  if (num === g.num) return out({ error: "Tidak bisa chat dengan diri sendiri" }, 400);
  const [t] = await sql`select tag from ghosh_alias where num = ${num}`;
  if (!t) return out({ error: "Unknown itu tidak ditemukan" }, 404);
  const [x, y] = [g.tag, String(t.tag)].sort();
  const [ex] = await sql`select id from ghosh_rooms where kind = 'dm' and a_tag = ${x} and b_tag = ${y}`;
  if (ex) return out({ ok: true, id: ex.id });
  const [r] = await sql`
    insert into ghosh_rooms (name, kind, a_tag, b_tag) values ('dm', 'dm', ${x}, ${y})
    on conflict (a_tag, b_tag) where kind = 'dm' do update set name = ghosh_rooms.name returning id`;
  return out({ ok: true, id: r.id });
}
