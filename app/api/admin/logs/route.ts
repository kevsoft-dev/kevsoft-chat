import { sql } from "@/lib/db";
import { getStaff } from "@/lib/auth";

export async function GET(req: Request) {
  const me = await getStaff();
  if (!me) return new Response("Forbidden", { status: 403 });
  const before = Number(new URL(req.url).searchParams.get("before")) || null;
  const rows = await sql`
    select id, actor_name, action, target_name, detail, created_at from mod_logs
    where (${before}::bigint is null or id < ${before}::bigint)
    order by id desc limit 60`;
  return Response.json(rows);
}
