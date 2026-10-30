import { notFound, redirect } from "next/navigation";
import { ensureDefaults, getUserId } from "@/lib/auth";
import { ensureSchema } from "@/lib/migrate";
import { sql } from "@/lib/db";
import Settings from "@/components/Settings";
import { SECTIONS } from "@/lib/settingsNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan · kevsoft-chat" };

export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  const id = section?.[0];
  if ((section && section.length > 1) || (id && !SECTIONS.some((s) => s.id === id))) notFound();
  const uid = await getUserId();
  if (!uid) redirect("/sign-in");
  await ensureSchema();
  await ensureDefaults(uid);
  const [u] = await sql`select username, name, email, avatar_url, bio, role, coalesce(away_enabled, false) as away_enabled, coalesce(away_message, '') as away_message from users where id = ${uid}`;
  if (!u?.username) redirect("/chat");
  return (
    <Settings section={id ?? ""} me={{
      username: String(u.username), name: String(u.name || u.username), email: (u.email as string) ?? "", avatar: (u.avatar_url as string) ?? null,
      bio: String(u.bio ?? ""), role: String(u.role ?? "user"), awayOn: !!u.away_enabled, awayMsg: String(u.away_message ?? ""),
    }} />
  );
}
