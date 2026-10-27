import { sql } from "@/lib/db";

// Foto sampul (banner) publik, boleh dilihat tanpa login.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^u_[a-f0-9]{32}$/.test(id)) return new Response("Not found", { status: 404 });
  const [a] = await sql`select mime, data from user_banners where user_id = ${id}`;
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(Buffer.from(a.data as string, "base64")), {
    headers: {
      "Content-Type": a.mime as string,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
