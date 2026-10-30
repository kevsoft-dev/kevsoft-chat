import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { limit, tooMany } from "@/lib/ratelimit";
import { MAX_LINKED, normCode, withDev } from "@/lib/devices";

// Dipanggil dari perangkat yang SUDAH login: approve=false hanya melihat detail perangkat peminta,
// approve=true menyetujui. Detail ditampilkan dulu supaya orang tidak asal menyetujui kode dari pihak lain.
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const l = await limit(`linkappr:${uid}`, 20, 600);
  if (!l.ok) return tooMany(l);
  const b = await req.json().catch(() => null);
  const code = normCode(b?.code);
  if (code.length !== 8) return Response.json({ error: "Kode harus 8 karakter." }, { status: 400 });
  const [r] = await withDev(() => sql`
    select label, platform, ip, extract(epoch from (expires_at - now()))::int as secs from link_requests
    where code = ${code} and approved_at is null and claimed_at is null and expires_at > now()`);
  if (!r) return Response.json({ error: "Kode tidak ditemukan atau sudah kedaluwarsa." }, { status: 404 });
  if (!b?.approve) return Response.json({ label: r.label, platform: r.platform, ip: r.ip, expires_in: r.secs });
  const [n] = await sql`select count(*)::int as c from devices where user_id = ${uid} and linked and revoked_at is null`;
  if (Number(n.c) >= MAX_LINKED) return Response.json({ error: `Maksimal ${MAX_LINKED} perangkat tertaut. Keluarkan salah satu dulu.` }, { status: 409 });
  const ok = await sql`update link_requests set user_id = ${uid}, approved_at = now() where code = ${code} and approved_at is null and expires_at > now() returning code`;
  if (!ok.length) return Response.json({ error: "Kode sudah tidak berlaku." }, { status: 409 });
  return Response.json({ ok: true });
}
