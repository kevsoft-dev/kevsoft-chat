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
    select id, username, name, avatar_url, bio, role, created_at, (role = 'owner' or verified) as verified
    from users where lower(username) = ${raw} and banned_at is null limit 1`;
  if (!target) notFound();

  const uid = await getUserId();

  // Belum login → profil publik + Chat now
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
          verified: !!target.verified,
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
    select id, username, name, avatar_url, bio, email, role, (role = 'owner' or verified) as verified, (password_hash is not null) as has_password
    from users where id = ${uid}`) as any[];

  if (!user?.username || !user?.has_password) {
    redirect(`/sign-in?next=${encodeURIComponent(`/dm/${raw}`)}`);
  }
  await ensureDefaults(uid);

  if (String(user.username).toLowerCase() === raw) {
    redirect(`/${raw}`);
  }

  // Pastikan DM ada di server (jangan andalkan client)
  let convId: string | null = null;
  const [existing] = await sql`
    select c.id from conversations c
    join conversation_members a on a.conversation_id = c.id and a.user_id = ${uid}
    join conversation_members b on b.conversation_id = c.id and b.user_id = ${target.id}
    where c.kind = 'dm' limit 1`;
  if (existing) {
    convId = String(existing.id);
    // unhide jika sebelumnya disembunyikan
    await sql`
      update conversation_members set hidden_at = null
      where conversation_id = ${convId}::uuid and user_id = ${uid}`;
  } else {
    const [conv] = await sql`
      insert into conversations (kind, created_by) values ('dm', ${uid}) returning id`;
    convId = String(conv.id);
    await sql`
      insert into conversation_members (conversation_id, user_id)
      values (${convId}::uuid, ${uid}), (${convId}::uuid, ${target.id})`;
  }

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
        verified: !!user.verified,
      }}
      pusherKey={cfg.pusher.key}
      pusherCluster={cfg.pusher.cluster}
      openId={convId}
    />
  );
}
