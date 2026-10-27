import { auth } from "@clerk/nextjs/server";
import { cfg } from "@/lib/config";
import { sql } from "@/lib/db";
import { clerk } from "@/lib/clerk";
import { ensureSchema } from "@/lib/migrate";

export const dynamic = "force-dynamic";

// Diagnosis: buka /api/health untuk melihat bagian mana yang bermasalah (tanpa menampilkan rahasia).
export async function GET() {
  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown> | unknown) => {
    try { out[name] = (await fn()) ?? "ok"; }
    catch (e: any) { out[name] = "ERROR: " + String(e?.message ?? e).slice(0, 240); }
  };
  await step("config", () => ({
    clerkPublishableKey: !!cfg.clerk.publishableKey,
    clerkSecretKey: !!cfg.clerk.secretKey,
    pusherAppId: !!cfg.pusher.appId,
    pusherKey: !!cfg.pusher.key,
    pusherSecret: !!cfg.pusher.secret,
  }));
  await step("database", async () => { await sql`select 1`; });
  await step("schema", async () => { await ensureSchema(); });
  await step("clerkApi", async () => { await clerk.users.getUserList({ limit: 1 }); });
  await step("auth", async () => ((await auth()).userId ? "signed-in" : "signed-out"));
  return Response.json(out);
}
