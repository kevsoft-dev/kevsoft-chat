import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";

const MAX = 400_000; // byte. Klien sudah memperkecil banner ke 960x320 (biasanya 30-80 KB).

// Jenis file ditentukan dari isi (magic bytes), bukan dari header. SVG sengaja tidak diterima.
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length < 100) return Response.json({ error: "File foto tidak valid" }, { status: 400 });
  if (buf.length > MAX) return Response.json({ error: "Foto sampul terlalu besar" }, { status: 413 });
  const mime = sniff(buf);
  if (!mime) return Response.json({ error: "Format foto harus JPG, PNG, atau WebP" }, { status: 415 });

  const url = `/api/banner/${uid}?v=${Date.now()}`;
  await sql`
    insert into user_banners (user_id, mime, data) values (${uid}, ${mime}, ${Buffer.from(buf).toString("base64")})
    on conflict (user_id) do update set mime = excluded.mime, data = excluded.data, updated_at = now()`;
  await sql`update users set banner_url = ${url} where id = ${uid}`;
  return Response.json({ banner_url: url });
}

export async function DELETE() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  await sql`delete from user_banners where user_id = ${uid}`;
  await sql`update users set banner_url = null where id = ${uid}`;
  return Response.json({ banner_url: null });
}
