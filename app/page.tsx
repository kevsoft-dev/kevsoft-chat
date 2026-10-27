import { redirect } from "next/navigation";
import { ensureDefaults, getUserId, syncUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/migrate";
import { sql } from "@/lib/db";
import { cfg } from "@/lib/config";
import Chat from "@/components/Chat";
import Onboarding from "@/components/Onboarding";

export const dynamic = "force-dynamic";

export default async function Home() {
  const uid = await getUserId();
  if (!uid) redirect("/sign-in");

  let user: { id: string; username: string | null; name: string | null } | undefined;
  try {
    await ensureSchema();
    await syncUser(uid);
    [user] = (await sql`select id, username, name from users where id = ${uid}`) as any;
    if (user?.username) await ensureDefaults(uid);
  } catch (e: any) {
    return (
      <main className="auth"><div className="auth-card">
        <span className="eyebrow">Terjadi masalah</span>
        <h1>Gagal memuat chat</h1>
        <p className="muted">Periksa <b>config.json</b> (databaseUrl, kunci Clerk) lalu muat ulang halaman.</p>
        <p className="error">{String(e?.message ?? e).slice(0, 300)}</p>
      </div></main>
    );
  }

  if (!user?.username) return <Onboarding suggestedName={user?.name ?? ""} />;
  return (
    <Chat
      me={{ id: user.id, username: user.username, name: user.name ?? user.username }}
      pusherKey={cfg.pusher.key}
      pusherCluster={cfg.pusher.cluster}
    />
  );
}
