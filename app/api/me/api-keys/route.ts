import { createHash, randomBytes } from "crypto";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { z } from "zod";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Daftar API key milik user (hanya jika developer_mode aktif). */
export async function GET() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const [u] = await sql`select developer_mode from users where id = ${uid}`;
  if (!u?.developer_mode) {
    return Response.json({ developer_mode: false, keys: [], message: "Aktifkan Mode Developer di Profil untuk membuat API key." });
  }

  const keys = await sql`
    select id, name, key_prefix, created_at, last_used_at
    from api_keys
    where user_id = ${uid} and revoked_at is null
    order by created_at desc
    limit 20`;

  return Response.json({
    developer_mode: true,
    keys: keys.map((k: any) => ({
      id: k.id,
      name: k.name,
      prefix: k.key_prefix + "…",
      created_at: k.created_at,
      last_used_at: k.last_used_at,
    })),
  });
}

/** Buat API key baru. Key lengkap hanya dikembalikan sekali. */
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const [u] = await sql`select developer_mode from users where id = ${uid}`;
  if (!u?.developer_mode) {
    return Response.json({ error: "Mode Developer belum aktif. Aktifkan dulu di Profil." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 40) || "Default" : "Default";

  const count = await sql`select count(*)::int as c from api_keys where user_id = ${uid} and revoked_at is null`;
  if ((count[0]?.c ?? 0) >= 5) {
    return Response.json({ error: "Maksimal 5 API key aktif. Cabut yang lama dulu." }, { status: 400 });
  }

  // Format: kc_ + 32 hex (mirip GitHub / Stripe style)
  const raw = "kc_" + randomBytes(24).toString("hex");
  const prefix = raw.slice(0, 11);
  const hash = sha(raw);

  const [row] = await sql`
    insert into api_keys (user_id, name, key_prefix, key_hash)
    values (${uid}, ${name}, ${prefix}, ${hash})
    returning id, name, key_prefix, created_at`;

  return Response.json({
    id: row.id,
    name: row.name,
    prefix: row.key_prefix + "…",
    key: raw, // HANYA sekali
    created_at: row.created_at,
    warning: "Simpan key ini sekarang. Setelah halaman ditutup, key tidak bisa dilihat lagi.",
  });
}

/** Cabut (revoke) API key. */
export async function DELETE(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return Response.json({ error: "id wajib" }, { status: 400 });

  const r = await sql`
    update api_keys set revoked_at = now()
    where id = ${id} and user_id = ${uid} and revoked_at is null
    returning id`;
  if (!r.length) return Response.json({ error: "Key tidak ditemukan" }, { status: 404 });
  return Response.json({ ok: true });
}
