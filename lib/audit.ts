import { sql } from "./db";

// Catatan semua tindakan moderasi (tampil di Console -> Log).
export async function logMod(a: { actorId: string; actorName: string; action: string; targetId?: string | null; targetName?: string | null; detail?: string | null }) {
  try {
    await sql`
      insert into mod_logs (actor_id, actor_name, action, target_id, target_name, detail)
      values (${a.actorId}, ${a.actorName}, ${a.action}, ${a.targetId ?? null}, ${a.targetName ?? null}, ${a.detail ?? null})`;
  } catch {}
}
