import { redirect } from "next/navigation";
import { ensureDefaults, getUserId } from "@/lib/auth";
import { ensureSchema } from "@/lib/migrate";
import { sql } from "@/lib/db";
import { cfg } from "@/lib/config";
import { readSessionMeta } from "@/lib/session";
import { isFresh } from "@/lib/token";
import Chat from "@/components/Chat";
import Onboarding from "@/components/Onboarding";

export const dynamic = "force-dynamic";

function Problem({ text }: { text: string }) {
  return (
    <main className="auth"><div className="auth-card">
      <span className="eyebrow">Terjadi masalah</span>
      <h1>Gagal memuat chat</h1>
      <p className="muted">Periksa <b>config.json</b> (databaseUrl, firebase), lalu buka <b>/api/health</b> untuk diagnosis.</p>
      <p className="error">{text.slice(0, 300)}</p>
    </div></main>
  );
}

type Row = { id: string; username: string | null; name: string | null; avatar_url: string | null; bio: string | null; email: string | null; role: string; has_password: boolean };

export default async function Home({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  let uid: string | null = null;
  let authError = "";
  try { uid = (await getUserId()) ?? null; } catch (e: any) { authError = String(e?.message ?? e); }
  if (authError) return <Problem text={authError} />;
  if (!uid) redirect("/sign-in");
  const userId = uid as string;

  let user: Row | undefined;
  try {
    await ensureSchema();
    [user] = (await sql`
      select id, username, name, avatar_url, bio, email, role, (password_hash is not null) as has_password
      from users where id = ${userId}`) as any;
    if (user?.username) await ensureDefaults(userId);
  } catch (e: any) {
    return <Problem text={String(e?.message ?? e)} />;
  }

  // Setelah verifikasi email/Google: wajib pilih username dan buat password (login berikutnya cukup username + password).
  const needUsername = !user?.username;
  const needPassword = !user?.has_password;
  const sp = await searchParams;
  const reset = !needUsername && !needPassword && sp.reset === "1" && isFresh(await readSessionMeta());
  if (!user || needUsername || needPassword || reset)
    return <Onboarding suggestedName={user?.name ?? ""} needUsername={needUsername} reset={reset} username={user?.username ?? ""} />;

  return (
    <Chat
      me={{ id: user.id, username: user.username as string, name: user.name ?? (user.username as string), avatarUrl: user.avatar_url || null, bio: user.bio, email: user.email, role: user.role }}
      pusherKey={cfg.pusher.key}
      pusherCluster={cfg.pusher.cluster}
    />
  );
}
