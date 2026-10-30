import { sql } from "@/lib/db";
import { forgetAuth, getUserId } from "@/lib/auth";
import { endSession, readSessionMeta } from "@/lib/session";
import { headers } from "next/headers";

function parseDevice(ua: string | null): { name: string; type: string } {
  const s = (ua || "").toLowerCase();
  if (/iphone|ipod/.test(s)) return { name: "iPhone", type: "mobile" };
  if (/ipad/.test(s)) return { name: "iPad", type: "tablet" };
  if (/android/.test(s) && /mobile/.test(s)) return { name: "Android", type: "mobile" };
  if (/android/.test(s)) return { name: "Android Tablet", type: "tablet" };
  if (/macintosh|mac os/.test(s)) return { name: "Mac", type: "desktop" };
  if (/windows/.test(s)) return { name: "Windows", type: "desktop" };
  if (/linux/.test(s)) return { name: "Linux", type: "desktop" };
  if (/edg\//.test(s)) return { name: "Edge", type: "web" };
  if (/chrome\//.test(s)) return { name: "Chrome", type: "web" };
  if (/firefox\//.test(s)) return { name: "Firefox", type: "web" };
  if (/safari\//.test(s)) return { name: "Safari", type: "web" };
  return { name: "Perangkat web", type: "web" };
}

/** Daftar perangkat tertaut (linked devices). */
export async function GET() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const h = await headers();
  const ua = h.get("user-agent");
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const meta = await readSessionMeta();

  const rows = await sql`
    select id, device_name, device_type, user_agent, ip, last_active, created_at, current
    from linked_devices
    where user_id = ${uid}
    order by last_active desc
    limit 40`;

  const current = rows.find((r: any) => r.current);
  if (current) {
    await sql`update linked_devices set last_active = now(), user_agent = ${ua}, ip = ${ip} where id = ${current.id}`;
  } else if (meta) {
    const dev = parseDevice(ua);
    await sql`update linked_devices set current = false where user_id = ${uid}`;
    await sql`
      insert into linked_devices (user_id, device_name, device_type, user_agent, ip, current)
      values (${uid}, ${dev.name}, ${dev.type}, ${ua}, ${ip}, true)`;
  }

  const list = await sql`
    select id, device_name as name, device_type as type, ip, last_active, created_at, current
    from linked_devices
    where user_id = ${uid}
    order by current desc, last_active desc
    limit 40`;

  return Response.json({
    devices: list.map((d: any) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      ip: d.ip ? String(d.ip).replace(/^::ffff:/, "") : null,
      last_active: d.last_active,
      created_at: d.created_at,
      current: !!d.current,
    })),
  });
}

/** Cabut satu perangkat (bukan yang sedang dipakai). */
export async function PATCH(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return Response.json({ error: "id wajib" }, { status: 400 });

  const [row] = await sql`select id, current from linked_devices where id = ${id} and user_id = ${uid}`;
  if (!row) return Response.json({ error: "Perangkat tidak ditemukan" }, { status: 404 });
  if (row.current) return Response.json({ error: "Tidak bisa mencabut perangkat yang sedang dipakai. Gunakan Keluar." }, { status: 400 });

  await sql`delete from linked_devices where id = ${id} and user_id = ${uid}`;
  return Response.json({ ok: true });
}

/** Keluar dari semua perangkat (naikkan token_version). */
export async function DELETE() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  await sql`update users set token_version = token_version + 1 where id = ${uid}`;
  await sql`delete from linked_devices where user_id = ${uid}`;
  forgetAuth(uid);
  await endSession();
  return Response.json({ ok: true });
}
