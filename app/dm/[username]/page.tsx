import { redirect, notFound } from "next/navigation";
import { getUserId, ensureDefaults } from "@/lib/auth";
import { ensureSchema } from "@/lib/migrate";
import { sql } from "@/lib/db";
import { cfg } from "@/lib/config";
import { USERNAME_RE, RESERVED } from "@/lib/mentions";
import Chat from "@/components/Chat";
import PublicProfile from "@/components/PublicProfile";

export const dynamic = "force-dynamic";

export default async function DmPage({ params }: { params: Promise<{ username: string }> }) {
  const raw = (await params).username?.replace(/^@/, "").toLowerCase().trim() ?? "";
  if (!USERNAME_RE.test(raw) || RESERVED.includes(raw)) notFound();

  await ensureSchema();

  const [target] = await sql`
    select id, username, name, avatar_url, bio, role, created_at
    from users where lower(username) = ${raw} and banned_at is null limit 1`;
  if (!target) notFound();

  const uid = await getUserId();

  // Belum login → tampilkan profil publik + tombol Chat now
  if (!uid) {
    return (
      <PublicProfile
        user={{
          id: target.id as string,
          username: String(target.username),
          name: (target.name as string | null) ?? String(target.username),
          avatar_url: (target.avatar_url as string | null) ?? null,
          bio: (target.bio as string | null) ?? null,
          role: String(target.role ?? "user"),
          created_at: String(target.created_at),
        }}
        isMe={false}
        meUsername=""
        loggedIn={false}
        fromDm
      />
    );
  }

  const [user] = (await sql`
    select id, username, name, avatar_url, bio, email, role, (password_hash is not null) as has_password
    from users where id = ${uid}`) as any[];

  if (!user?.username || !user?.has_password) {
    redirect(`/sign-in?next=${encodeURIComponent(`/dm/${raw}`)}`);
  }
  await ensureDefaults(uid);

  if (String(user.username).toLowerCase() === raw) redirect(`/${raw}`);

  return (
    <Chat
      me={{
        id: user.id,
        username: user.username as string,
        name: user.name ?? (user.username as string),
        avatarUrl: user.avatar_url || null,
        bio: user.bio,
        email: user.email,
        role: user.role,
      }}
      pusherKey={cfg.pusher.key}
      pusherCluster={cfg.pusher.cluster}
      openDm={raw}
    />
  );
}
