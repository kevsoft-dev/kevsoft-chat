import { sql } from "./db";
import { readSession } from "./session";
import { COMMUNITY_ID } from "./mentions";

// userId SELALU dari cookie sesi yang ditandatangani server, tidak pernah dari body request.
export async function getUserId() {
  return readSession();
}

// Setiap user otomatis masuk Komunitas Kevsoft dan punya chat Kev-Ai sendiri.
export async function ensureDefaults(userId: string) {
  await sql`
    insert into conversation_members (conversation_id, user_id)
    values (${COMMUNITY_ID}, ${userId}) on conflict do nothing`;
  const [ai] = await sql`
    insert into conversations (kind, title, created_by) values ('ai', 'Kev-Ai', ${userId})
    on conflict (created_by) where kind = 'ai' do nothing returning id`;
  if (ai)
    await sql`insert into conversation_members (conversation_id, user_id) values (${ai.id}, ${userId}) on conflict do nothing`;
}
