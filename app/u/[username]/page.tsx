import { notFound } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/migrate";
import { USERNAME_RE, RESERVED } from "@/lib/mentions";
import PublicProfile from "@/components/PublicProfile";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const uid = await getUserId();
  const raw = (await params).username?.replace(/^@/, "").toLowerCase().trim() ?? "";
  if (!USERNAME_RE.test(raw) || RESERVED.includes(raw)) notFound();

  await ensureSchema();
  const [u] = await sql`
    select id, username, name, avatar_url, banner_url, bio, role, created_at, (role = 'owner' or verified) as verified
    from users where lower(username) = ${raw} and banned_at is null limit 1`;
  if (!u) notFound();

  let meUsername = "";
  if (uid) {
    const [me] = await sql`select username from users where id = ${uid}`;
    meUsername = (me?.username as string) || "";
  }

  return (
    <PublicProfile
      user={{
        id: u.id as string,
        username: String(u.username),
        name: (u.name as string | null) ?? String(u.username),
        avatar_url: (u.avatar_url as string | null) ?? null,
        banner_url: (u.banner_url as string | null) ?? null,
        bio: (u.bio as string | null) ?? null,
        role: String(u.role ?? "user"),
        verified: !!u.verified,
        created_at: String(u.created_at),
      }}
      isMe={!!uid && u.id === uid}
      meUsername={meUsername}
      loggedIn={!!uid}
    />
  );
}
