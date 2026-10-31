import { redirect, notFound } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { ensureSchema } from "@/lib/migrate";
import { sql } from "@/lib/db";
import { USERNAME_RE, RESERVED } from "@/lib/mentions";
import PublicProfile from "@/components/PublicProfile";

export const dynamic = "force-dynamic";

// /dm/{username}: tamu melihat profil publik + "Chat now". Yang sudah login langsung ke /chat/dm/{username}.
export default async function DmPage({ params }: { params: Promise<{ username: string }> }) {
  const raw = (await params).username?.replace(/^@/, "").toLowerCase().trim() ?? "";
  if (!USERNAME_RE.test(raw) || RESERVED.includes(raw)) notFound();

  await ensureSchema();

  const [target] = await sql`
    select id, username, name, avatar_url, banner_url, bio, role, created_at, (role = 'owner' or verified) as verified
    from users where lower(username) = ${raw} and banned_at is null limit 1`;
  if (!target) notFound();

  const uid = await getUserId();

  if (uid) {
    // Chat dengan diri sendiri tidak ada: tampilkan profil sendiri.
    if (String(target.id) === uid) redirect(`/${raw}`);
    redirect(`/chat/dm/${encodeURIComponent(raw)}`);
  }

  // Belum login → profil publik + Chat now
  return (
    <PublicProfile
      user={{
        id: target.id as string,
        username: String(target.username),
        name: (target.name as string | null) ?? String(target.username),
        avatar_url: (target.avatar_url as string | null) ?? null,
        banner_url: (target.banner_url as string | null) ?? null,
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
