import { auth } from "@clerk/nextjs/server";
import { clerk } from "./clerk";
import { sql } from "./db";

// userId SELALU dari sesi Clerk di server, tidak pernah dari body request.
export async function getUserId() {
  const { userId } = await auth();
  return userId;
}

// Sinkronkan profil Clerk ke Neon (dipanggil saat memuat daftar chat).
export async function syncUser(userId: string) {
  const u = await clerk.users.getUser(userId);
  const email = u?.emailAddresses[0]?.emailAddress?.toLowerCase() ?? null;
  const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || email?.split("@")[0] || "Pengguna";
  await sql`
    insert into users (id, email, name, avatar_url)
    values (${userId}, ${email}, ${name}, ${u?.imageUrl ?? null})
    on conflict (id) do update
      set email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url`;
}
