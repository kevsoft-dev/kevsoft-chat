import { z } from "zod";
import { sql } from "@/lib/db";
import { ensureDefaults, getUserId } from "@/lib/auth";
import { RESERVED, USERNAME_RE } from "@/lib/mentions";
import { hashPassword, passwordProblem } from "@/lib/password";

const schema = z.object({
  username: z.string().trim().toLowerCase(),
  name: z.string().trim().min(1).max(40).optional(),
  password: z.string().max(128),
});

const DEFAULT_AWAY =
  "Halo,\nTerima kasih sudah menghubungi Kevsoft. Saat ini saya sedang tidak di tempat.\nPesan kamu akan saya balas segera setelah kembali online.";

const noCtl = (s: string) => !/[\u0000-\u001f\u007f]/.test(s);
const patchSchema = z.object({
  name: z.string().trim().min(1, "Nama tidak boleh kosong").max(40, "Maksimal 40 karakter").refine(noCtl, "Karakter tidak valid").optional(),
  bio: z.string().trim().max(140, "Maksimal 140 karakter").refine((s) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s), "Karakter tidak valid").optional(),
  away_enabled: z.boolean().optional(),
  away_message: z.string().trim().max(500, "Maksimal 500 karakter").refine((s) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s), "Karakter tidak valid").optional(),
  developer_mode: z.boolean().optional(),
});

export async function GET() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const [u] = await sql`
    select id, username, name, avatar_url, banner_url, bio, email, role,
      (role = 'owner' or verified) as verified,
      coalesce(away_enabled, false) as away_enabled,
      coalesce(nullif(away_message, ''), ${DEFAULT_AWAY}) as away_message,
      coalesce(developer_mode, false) as developer_mode
    from users where id = ${uid}`;
  return Response.json(u ?? null);
}

// Edit profil + pengaturan "tidak di tempat".
export async function PATCH(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "Data tidak valid" }, { status: 400 });
  const { name, bio, away_enabled, away_message, developer_mode } = parsed.data;
  if (name === undefined && bio === undefined && away_enabled === undefined && away_message === undefined && developer_mode === undefined)
    return Response.json({ error: "Tidak ada perubahan" }, { status: 400 });

  // Saat dinyalakan, catat waktu mulai supaya auto-balas tidak spam pesan lama.
  const [u] = await sql`
    update users set
      name = coalesce(${name ?? null}::text, name),
      bio = case when ${bio ?? null}::text is null then bio else ${bio ?? null}::text end,
      away_enabled = coalesce(${away_enabled ?? null}::boolean, away_enabled),
      away_message = case when ${away_message ?? null}::text is null then away_message else ${away_message ?? null}::text end,
      away_since = case
        when ${away_enabled ?? null}::boolean = true then now()
        when ${away_enabled ?? null}::boolean = false then null
        else away_since
      end,
      developer_mode = coalesce(${developer_mode ?? null}::boolean, developer_mode)
    where id = ${uid}
    returning id, username, name, avatar_url, banner_url, bio,
      coalesce(away_enabled, false) as away_enabled,
      coalesce(nullif(away_message, ''), ${DEFAULT_AWAY}) as away_message,
      coalesce(developer_mode, false) as developer_mode`;
  return Response.json(u);
}

// Set username + password (sekali, setelah verifikasi email/Google pertama).
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const { username, name, password } = parsed.data;

  if (!USERNAME_RE.test(username))
    return Response.json({ error: "Username 3-20 karakter: huruf kecil, angka, _ . - (tidak diakhiri . atau -)" }, { status: 400 });
  if (RESERVED.includes(username)) return Response.json({ error: "Username ini dicadangkan" }, { status: 400 });
  const pwErr = passwordProblem(password, username);
  if (pwErr) return Response.json({ error: pwErr }, { status: 400 });

  const [me] = await sql`select username from users where id = ${uid}`;
  if (me?.username) return Response.json({ error: "Username sudah diatur dan tidak bisa diganti" }, { status: 409 });

  const hash = await hashPassword(password);
  try {
    await sql`
      update users set username = ${username}, name = coalesce(${name ?? null}, name), password_hash = ${hash}, login_fails = 0, locked_until = null
      where id = ${uid} and username is null`;
  } catch {
    return Response.json({ error: "Username sudah dipakai" }, { status: 409 });
  }
  await ensureDefaults(uid);
  return Response.json({ ok: true, username });
}
