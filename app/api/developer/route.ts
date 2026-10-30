import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { MAX_KEYS, withDev } from "@/lib/devices";

async function state(uid: string) {
  const [u] = await withDev(() => sql`select dev_mode_at from users where id = ${uid}`);
  const enabled = !!u?.dev_mode_at;
  const keys = enabled
    ? (await sql`select id, name, prefix, created_at, last_used from api_keys where user_id = ${uid} and revoked_at is null order by created_at desc`).map((k) => ({
        id: String(k.id), name: String(k.name), prefix: String(k.prefix),
        created_at: new Date(k.created_at as string).toISOString(), last_used: k.last_used ? new Date(k.last_used as string).toISOString() : null,
      }))
    : [];
  return { enabled, since: u?.dev_mode_at ? new Date(u.dev_mode_at as string).toISOString() : null, keys, max_keys: MAX_KEYS };
}

export async function GET() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  return Response.json(await state(uid));
}

// Bergabung ke developer mode: harus setuju syarat. Tanpa ini tidak ada API key yang bisa dibuat.
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const b = await req.json().catch(() => null);
  if (b?.accept !== true) return Response.json({ error: "Setujui syarat developer mode dulu." }, { status: 400 });
  await withDev(() => sql`update users set dev_mode_at = coalesce(dev_mode_at, now()) where id = ${uid}`);
  return Response.json(await state(uid));
}

// Keluar dari developer mode: semua key langsung dicabut.
export async function DELETE() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  await withDev(() => sql`update users set dev_mode_at = null where id = ${uid}`);
  await sql`update api_keys set revoked_at = now() where user_id = ${uid} and revoked_at is null`;
  return Response.json(await state(uid));
}
