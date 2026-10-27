import { getUserId } from "@/lib/auth";
import { cfg } from "@/lib/config";
import { sql } from "@/lib/db";
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
    firebaseProjectId: cfg.firebase.projectId,
    firebaseApiKey: !!cfg.firebase.apiKey,
    otpSecret: !!cfg.otpSecret,
    pusherAppId: !!cfg.pusher.appId,
    pusherKey: !!cfg.pusher.key,
    pusherSecret: !!cfg.pusher.secret,
  }));
  await step("database", async () => { await sql`select 1`; });
  await step("schema", async () => { await ensureSchema(); });
  await step("firebaseKeys", async () => {
    const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    if (!r.ok) throw new Error("HTTP " + r.status);
  });
  await step("session", async () => ((await getUserId()) ? "signed-in" : "signed-out"));
  return Response.json(out);
}
