import { redirect, notFound } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/migrate";
import { USERNAME_RE, RESERVED } from "@/lib/mentions";

export const dynamic = "force-dynamic";

export default async function GroupLinkPage({ params }: { params: Promise<{ handle: string }> }) {
  const raw = (await params).handle?.replace(/^@/, "").toLowerCase().trim() ?? "";
  if (!USERNAME_RE.test(raw) || RESERVED.includes(raw)) notFound();

  const uid = await getUserId();
  if (!uid) redirect(`/sign-in?next=${encodeURIComponent(`/g/${raw}`)}`);

  await ensureSchema();
  const [g] = await sql`
    select id, title, handle from conversations
    where kind = 'group' and lower(handle) = ${raw} limit 1`;
  if (!g) notFound();

  // Auto-join jika belum anggota (kecuali pernah di-kick)
  const [mem] = await sql`
    select 1 from conversation_members where conversation_id = ${g.id} and user_id = ${uid}`;
  if (!mem) {
    const [kicked] = await sql`
      select 1 from conversation_kicks where conversation_id = ${g.id} and user_id = ${uid}`;
    if (!kicked) {
      await sql`
        insert into conversation_members (conversation_id, user_id, role)
        values (${g.id}, ${uid}, 'member') on conflict do nothing`;
    }
  }

  redirect(`/chat/grup/${g.id}`);
}
