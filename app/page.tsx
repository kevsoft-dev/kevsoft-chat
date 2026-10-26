import { redirect } from "next/navigation";
import { ensureDefaults, getUserId, syncUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { cfg } from "@/lib/config";
import Chat from "@/components/Chat";
import Onboarding from "@/components/Onboarding";

export const dynamic = "force-dynamic";

export default async function Home() {
  const uid = await getUserId();
  if (!uid) redirect("/sign-in");
  await syncUser(uid);
  const [u] = await sql`select id, username, name from users where id = ${uid}`;
  if (!u?.username) return <Onboarding suggestedName={u?.name ?? ""} />;
  await ensureDefaults(uid);
  return (
    <Chat
      me={{ id: u.id, username: u.username, name: u.name ?? u.username }}
      pusherKey={cfg.pusher.key}
      pusherCluster={cfg.pusher.cluster}
    />
  );
}
