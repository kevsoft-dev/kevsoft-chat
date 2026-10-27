import { z } from "zod";
import { sql } from "@/lib/db";
import { ensureDefaults, getUserId } from "@/lib/auth";
import { RESERVED, USERNAME_RE } from "@/lib/mentions";

const schema = z.object({
  username: z.string().trim().toLowerCase(),
  name: z.string().trim().min(1).max(40).optional(),
});

export async function GET() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const [u] = await sql`select id, username, name, avatar_url from users where id = ${uid}`;
  return Response.json(u ?? null);
}

// Set username (sekali, setelah login pertama).
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const { username, name } = parsed.data;

  if (!USERNAME_RE.test(username))
    return Response.json({ error: "Username 3-20 karakter: huruf kecil, angka, _ . - (tidak diakhiri . atau -)" }, { status: 400 });
  if (RESERVED.includes(username)) return Response.json({ error: "Username ini dicadangkan" }, { status: 400 });

  const [me] = await sql`select username from users where id = ${uid}`;
  if (me?.username) return Response.json({ error: "Username sudah diatur dan tidak bisa diubah" }, { status: 409 });

  try {
    await sql`update users set username = ${username}, name = coalesce(${name ?? null}, name) where id = ${uid} and username is null`;
  } catch {
    return Response.json({ error: "Username sudah dipakai" }, { status: 409 });
  }
  await ensureDefaults(uid);
  return Response.json({ ok: true, username });
}
