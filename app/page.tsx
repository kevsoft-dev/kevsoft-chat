import { redirect } from "next/navigation";
import { ensureDefaults, getUserId, syncUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/migrate";
import { sql } from "@/lib/db";
import { cfg } from "@/lib/config";
import Chat from "@/components/Chat";
import Onboarding from "@/components/Onboarding";

export const dynamic = "force-dynamic";

function Problem({ text }: { text: string }) {
  return (
    <main className="auth"><div className="auth-card">
      <span className="eyebrow">Terjadi masalah</span>
      <h1>Gagal memuat chat</h1>
      <p className="muted">Periksa <b>config.json</b> (databaseUrl, kunci Clerk), lalu buka <b>/api/health</b> untuk diagnosis.</p>
      <p className="error">{text.slice(0, 300)}</p>
    </div></main>
  );
}

export default async function Home() {
  let uid: string | null = null;
  let authError = "";
  try { uid = (await getUserId()) ?? null; } catch (e: any) { authError = String(e?.message ?? e); }
  if (authError) return <Problem text={authError} />;
  if (!uid) redirect("/sign-in");

  let user: { id: string; username: string | null; name: string | null } | undefined;
  try {
    await ensureSchema();
    await syncUser(uid);
    [user] = (await sql`select id, username, name from users where id = ${uid}`) as any;
    if (user?.username) await ensureDefaults(uid);
  } catch (e: any) {
    return <Problem text={String(e?.message ?? e)} />;
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
