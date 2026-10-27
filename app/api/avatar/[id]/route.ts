import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";

// Foto profil disajikan dari Neon dan di-cache lama di browser (URL berubah lewat ?v= saat diganti).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^u_[a-f0-9]{32}$/.test(id)) return new Response("Not found", { status: 404 });
  const [a] = await sql`select mime, data from user_avatars where user_id = ${id}`;
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(Buffer.from(a.data as string, "base64")), {
    headers: {
      "Content-Type": a.mime as string,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
