import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/migrate";
import { INVITE_RE } from "@/lib/invite";
import JoinGroup from "@/components/JoinGroup";

export const dynamic = "force-dynamic";

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <main className="auth"><div className="auth-card">
      <span className="eyebrow">Undangan grup</span>
      <h1>{title}</h1>
      <p className="muted">{text}</p>
      <a className="link" href="/chat">Kembali ke chat</a>
    </div></main>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code ?? "";
  const uid = await getUserId();
  if (!uid) redirect(`/sign-in?next=${encodeURIComponent("/join/" + code)}`);

  await ensureSchema();
  const [g] = INVITE_RE.test(code)
    ? await sql`
        select c.id, c.title, c.description, c.avatar_url,
          (select count(*) from conversation_members m where m.conversation_id = c.id)::int as member_count
        from conversations c where c.kind = 'group' and c.invite_code = ${code} limit 1`
    : [];
  if (!g) return <Notice title="Link tidak berlaku" text="Link undangan ini salah atau sudah direset oleh admin grup. Minta link terbaru ke admin grupnya." />;

  const [mem] = await sql`select 1 from conversation_members where conversation_id = ${g.id} and user_id = ${uid}`;
  if (mem) redirect(`/chat/grup/${g.id}`);
  const [kicked] = await sql`select 1 from conversation_kicks where conversation_id = ${g.id} and user_id = ${uid}`;
  if (kicked) return <Notice title="Tidak bisa bergabung" text="Kamu dikeluarkan dari grup ini oleh admin." />;

  return (
    <JoinGroup
      code={code}
      title={String(g.title ?? "Grup")}
      description={(g.description as string | null) ?? null}
      memberCount={Number(g.member_count)}
      avatar={(g.avatar_url as string | null) ?? null}
    />
  );
}
