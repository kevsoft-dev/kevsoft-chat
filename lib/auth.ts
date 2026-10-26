import { auth } from "@clerk/nextjs/server";
import { clerk } from "./clerk";
import { sql } from "./db";
import { COMMUNITY_ID } from "./mentions";

// userId SELALU dari sesi Clerk di server, tidak pernah dari body request.
export async function getUserId() {
  const { userId } = await auth();
  return userId;
}

// Salin profil Clerk ke Neon saat pertama kali login.
export async function syncUser(userId: string) {
  const [exists] = await sql`select 1 as ok from users where id = ${userId}`;
  if (exists) return;
  const u = await clerk.users.getUser(userId);
  const email = u.emailAddresses[0]?.emailAddress?.toLowerCase() ?? null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || email?.split("@")[0] || "Pengguna";
  await sql`
    insert into users (id, email, name, avatar_url)
    values (${userId}, ${email}, ${name}, ${u.imageUrl ?? null})
    on conflict (id) do nothing`;
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
