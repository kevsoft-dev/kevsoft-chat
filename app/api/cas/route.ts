import { after } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getActor } from "@/lib/auth";
import { limit, tooMany } from "@/lib/ratelimit";
import { isRootEmail } from "@/lib/roles";
import { db, DbNotConfigured, ID_RE, newId } from "@/lib/firebaseDb";
import { CAS_PATH, LEASE_MS, MAX_LEN, MAX_TRIES, MIN_LEN, TYPES, looksLikeSpam, reviewComment, type CasRow } from "@/lib/cas";

export const maxDuration = 30; // peninjauan AI berjalan di latar (after) dan bisa memakan waktu

const err = (e: unknown) =>
  Response.json({ error: e instanceof DbNotConfigured ? e.message : "Kolom kritik & saran sedang bermasalah. Coba lagi nanti." }, { status: e instanceof DbNotConfigured ? 503 : 502 });

async function load() {
  const r = await db("GET", CAS_PATH, undefined, { orderBy: '"$key"', limitToLast: "300" });
  return Object.entries((r.data ?? {}) as Record<string, CasRow>)
    .filter(([id, c]) => ID_RE.test(id) && c && typeof c.body === "string" && typeof c.userId === "string");
}

// Daftar: komentar baik (LIKE) paling atas, lalu yang diterima (ACC). Komentar dalam peninjauan hanya tampil ke penulisnya.
export async function GET() {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });
  try {
    const rows = await load();
    const root = isRootEmail(me.email);
    const now = Date.now();

    // Komentar yang macet (AI belum menjawab jelas) dicoba lagi otomatis di latar.
    const stale = rows
      .filter(([, c]) => c.status === "review" && (c.tries ?? 0) < MAX_TRIES && now - (c.createdAt || 0) > 15_000 && now - (c.reviewAt ?? 0) > LEASE_MS)
      .slice(0, 3);
    if (stale.length) after(async () => { for (const [id] of stale) await reviewComment(id).catch(() => {}); });

    const open = rows.filter(([, c]) => c.status === "acc" || c.status === "like");
    const ids = [...new Set(open.map(([, c]) => c.userId))];
    const us = ids.length
      ? await sql`select id, username, coalesce(name, username) as name, avatar_url, role, verified from users where id = any(${ids}::text[]) and banned_at is null`
      : [];
    const byId = new Map(us.map((u) => [u.id as string, u]));

    const comments = open
      .filter(([, c]) => byId.has(c.userId))
      .map(([id, c]) => {
        const u = byId.get(c.userId)!;
        return {
          id, body: c.body, type: c.type, status: c.status,
          created_at: new Date(c.createdAt || 0).toISOString(),
          reviewed_at: c.reviewedAt ? new Date(c.reviewedAt).toISOString() : null,
          can_delete: root || c.userId === me.id, mine: c.userId === me.id,
          user: { id: u.id, username: u.username, name: u.name, avatar_url: u.avatar_url, role: u.role, verified: !!u.verified },
        };
      })
      .sort((a, b) => (a.status === b.status ? (a.id < b.id ? 1 : -1) : a.status === "like" ? -1 : 1));

    const pending = rows
      .filter(([, c]) => c.status === "review" && c.userId === me.id)
      .map(([id, c]) => ({ id, body: c.body, type: c.type, created_at: new Date(c.createdAt || 0).toISOString(), tries: c.tries ?? 0 }))
      .sort((a, b) => (a.id < b.id ? 1 : -1));

    return Response.json({ comments, pending, queue: root ? rows.filter(([, c]) => c.status === "review").length : null });
  } catch (e) { return err(e); }
}

const schema = z.object({ body: z.string().trim().min(MIN_LEN).max(MAX_LEN), type: z.enum(TYPES) });

// Kirim -> masa peninjauan. AI membalas satu kata (RM / ACC / LIKE) di latar.
export async function POST(req: Request) {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: `Tulis ${MIN_LEN}-${MAX_LEN} karakter` }, { status: 400 });
  const rl = await limit(`cas:${me.id}`, 4, 600);
  if (!rl.ok) return tooMany(rl, "Kamu mengirim terlalu cepat. Coba lagi beberapa menit lagi.");
  const [mu] = await sql`select 1 as x from users where id = ${me.id} and muted_until > now()`;
  if (mu) return Response.json({ error: "Kamu sedang dibisukan oleh moderator" }, { status: 403 });

  // Spam yang jelas langsung ditolak (setara RM) tanpa memanggil AI.
  if (looksLikeSpam(p.data.body)) return Response.json({ ok: true, id: null, verdict: "RM" });

  try {
    const mine = (await load()).filter(([, c]) => c.userId === me.id && c.status === "review").length;
    if (mine >= 3) return Response.json({ error: "Tunggu peninjauan komentar sebelumnya selesai dulu" }, { status: 429 });
    const id = newId();
    const row: CasRow = { userId: me.id, body: p.data.body, type: p.data.type, status: "review", createdAt: Date.now(), tries: 0 };
    await db("PUT", `${CAS_PATH}/${id}`, row);
    after(async () => { await reviewComment(id).catch(() => {}); });
    return Response.json({ ok: true, id });
  } catch (e) { return err(e); }
}

// Hapus: penulisnya sendiri atau owner utama.
export async function DELETE(req: Request) {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!ID_RE.test(id)) return new Response("Bad request", { status: 400 });
  try {
    const c = (await db("GET", `${CAS_PATH}/${id}`)).data as CasRow | null;
    if (!c) return new Response("Not found", { status: 404 });
    if (c.userId !== me.id && !isRootEmail(me.email)) return Response.json({ error: "Tidak diizinkan" }, { status: 403 });
    await db("DELETE", `${CAS_PATH}/${id}`);
    return Response.json({ ok: true });
  } catch (e) { return err(e); }
}
