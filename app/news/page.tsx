import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { ensureSchema } from "@/lib/migrate";
import { sql } from "@/lib/db";
import NewsPage from "@/components/NewsPage";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function NewsRoute() {
  let uid: string | null = null;
  try {
    uid = (await getUserId()) ?? null;
  } catch {
    redirect("/sign-in");
  }
  if (!uid) redirect("/sign-in");

  let user: { id: string; username: string | null; role: string } | undefined;
  try {
    await ensureSchema();
    [user] = (await sql`
      select id, username, role from users where id = ${uid}`) as any;
  } catch {
    redirect("/chat");
  }

  if (!user?.username) redirect("/chat");

  return (
    <Suspense fallback={<div className="np"><div className="np-bar" /><div className="np-main"><div className="np-grid">{Array.from({length:4}).map((_,i)=><div key={i} className="np-card skel"/>)}</div></div></div>}>
      <NewsPage me={{ id: user.id, username: user.username, role: user.role }} />
    </Suspense>
  );
}
