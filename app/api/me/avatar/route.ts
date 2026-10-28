import { clientIp, limit, tooMany } from "@/lib/ratelimit";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";

const MAX = 150_000; // byte. Klien sudah memperkecil foto ke 256x256 (biasanya 10-30 KB).

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
  const rl = await limit(`img:${uid}`, 10, 600);
  if (!rl.ok) return tooMany(rl);
  if (Number(req.headers.get("content-length") ?? 0) > MAX * 2) return Response.json({ error: "Foto terlalu besar" }, { status: 413 });
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length < 100) return Response.json({ error: "File foto tidak valid" }, { status: 400 });
  if (buf.length > MAX) return Response.json({ error: "Foto terlalu besar" }, { status: 413 });
  const mime = sniff(buf);
  if (!mime) return Response.json({ error: "Format foto harus JPG, PNG, atau WebP" }, { status: 415 });

  const url = `/api/avatar/${uid}?v=${Date.now()}`;
  await sql`
    insert into user_avatars (user_id, mime, data) values (${uid}, ${mime}, ${Buffer.from(buf).toString("base64")})
    on conflict (user_id) do update set mime = excluded.mime, data = excluded.data, updated_at = now()`;
  await sql`update users set avatar_url = ${url} where id = ${uid}`;
  return Response.json({ avatar_url: url });
}

// Hapus foto: kosong ('') supaya foto Google tidak otomatis kembali saat login berikutnya.
export async function DELETE() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  await sql`delete from user_avatars where user_id = ${uid}`;
  await sql`update users set avatar_url = '' where id = ${uid}`;
  return Response.json({ avatar_url: null });
}
