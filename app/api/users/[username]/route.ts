import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { USERNAME_RE } from "@/lib/mentions";

// Profil publik user (harus login). Dipakai di /{username} dan sheet kontak.
export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const raw = (await ctx.params).username?.replace(/^@/, "").toLowerCase().trim() ?? "";
  if (!USERNAME_RE.test(raw)) return Response.json({ error: "Username tidak valid" }, { status: 400 });

  const [u] = await sql`
    select id, username, name, avatar_url, banner_url, bio, role, created_at, (role = 'owner' or verified) as verified
    from users
    where lower(username) = ${raw} and banned_at is null
    limit 1`;
  if (!u) return Response.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });

  return Response.json({
    id: u.id,
    username: u.username,
    name: u.name,
    avatar_url: u.avatar_url,
    banner_url: u.banner_url ?? null,
    bio: u.bio,
    role: u.role,
    verified: !!u.verified,
    created_at: u.created_at,
    is_me: u.id === uid,
  });
}
