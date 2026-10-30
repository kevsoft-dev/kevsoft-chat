import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { ensureSchema } from "@/lib/migrate";
import { sql } from "@/lib/db";
import { isRootEmail } from "@/lib/roles";
import Cas from "@/components/Cas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kritik & Saran · kevsoft", description: "Criticism and suggestions untuk kevsoft." };

export default async function CasRoute() {
  let uid: string | null = null;
  try { uid = (await getUserId()) ?? null; } catch { redirect("/sign-in?next=/cas"); }
  if (!uid) redirect("/sign-in?next=/cas");

  let user: { id: string; username: string | null; name: string | null; avatar_url: string | null; email: string | null; role: string; verified: boolean } | undefined;
  try {
    await ensureSchema();
    [user] = (await sql`select id, username, name, avatar_url, email, role, verified from users where id = ${uid}`) as any;
  } catch { redirect("/chat"); }
  if (!user?.username) redirect("/chat");

  return (
    <Cas me={{
      id: user.id, username: user.username, name: user.name || user.username,
      avatarUrl: user.avatar_url, verified: !!user.verified || user.role === "owner", root: isRootEmail(user.email),
    }} />
  );
}
