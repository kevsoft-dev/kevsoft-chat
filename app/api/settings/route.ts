import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId, getStaff } from "@/lib/auth";
import { isRootEmail, rank } from "@/lib/roles";
import { ensureSchema } from "@/lib/migrate";

const DEFAULTS = { role_owner: "Owner", role_admin: "Admin", role_user: "Member" };

export async function GET() {
  await ensureSchema();
  // Publik untuk label badge (login optional — dipakai di profil publik juga)
  const rows = await sql`select key, value from app_settings where key like 'role_%'`;
  const out = { ...DEFAULTS } as Record<string, string>;
  for (const r of rows) out[String(r.key)] = String(r.value);
  return Response.json({
    owner: out.role_owner || DEFAULTS.role_owner,
    admin: out.role_admin || DEFAULTS.role_admin,
    user: out.role_user || DEFAULTS.role_user,
  });
}

export async function PATCH(req: Request) {
  const me = await getStaff();
  if (!me || rank(me.role) < 2 || !isRootEmail(me.email)) return Response.json({ error: "Hanya owner utama" }, { status: 403 });
  await ensureSchema();

  const body = z.object({
    owner: z.string().trim().min(1).max(24).optional(),
    admin: z.string().trim().min(1).max(24).optional(),
    user: z.string().trim().min(1).max(24).optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const map: [string, string | undefined][] = [
    ["role_owner", body.data.owner],
    ["role_admin", body.data.admin],
    ["role_user", body.data.user],
  ];
  for (const [k, v] of map) {
    if (!v) continue;
    await sql`
      insert into app_settings (key, value, updated_at) values (${k}, ${v}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()`;
  }
  return GET();
}
