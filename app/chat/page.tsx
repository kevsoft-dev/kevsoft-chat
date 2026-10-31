import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/migrate";
import { ChatEntry } from "@/lib/chatEntry";
import { chatPath } from "@/lib/chatRoute";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /chat = daftar chat. Tautan lama diteruskan ke alamat baru:
//   /chat?dm=user     -> /chat/dm/user
//   /chat?open=<id>   -> /chat/dm/{username} | /chat/grup/{id} | /chat/ai
//   /chat?news=<id>   -> /news?id=<id>
export default async function ChatHome({ searchParams }: { searchParams: Promise<{ reset?: string; dm?: string; news?: string; open?: string }> }) {
  const sp = await searchParams;

  if (sp.news) redirect(`/news?id=${encodeURIComponent(sp.news)}`);

  const dm = (sp.dm || "").toLowerCase().replace(/^@/, "").trim();
  if (dm) redirect(`/chat/dm/${encodeURIComponent(dm)}`);

  const open = (sp.open || "").trim();
  if (open && UUID.test(open)) {
    const uid = await getUserId();
    if (uid) {
      await ensureSchema();
      const [c] = await sql`
        select c.id, c.kind,
          (select u.username from conversation_members m join users u on u.id = m.user_id
            where m.conversation_id = c.id and m.user_id <> ${uid} limit 1) as other_username
        from conversations c
        join conversation_members me on me.conversation_id = c.id and me.user_id = ${uid}
        where c.id = ${open}::uuid`;
      if (c) redirect(chatPath({ id: String(c.id), kind: c.kind as any, other_username: (c.other_username as string | null) ?? null }));
      redirect("/chat");
    }
  }

  return ChatEntry({ next: "/chat", reset: sp.reset === "1" });
}
