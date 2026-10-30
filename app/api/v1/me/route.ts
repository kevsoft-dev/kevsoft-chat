import { devKeyOf, fail, guard, preflight, reply } from "@/lib/publicApi";

export const OPTIONS = preflight;

// Akun API: siapa pemilik key ini dan batasnya. Hanya untuk key developer (bukan key config server).
export async function GET(req: Request) {
  const g = await guard(req);
  if (g) return g;
  const k = devKeyOf(req);
  if (!k) return fail(403, "Endpoint ini hanya untuk API key developer. Buat key di Pengaturan > Developer.");
  return reply({
    data: {
      developer: { username: k.username, name: k.owner },
      key: { id: k.id, name: k.name, prefix: k.prefix, created_at: k.created_at, last_used: k.last_used },
      limits: { per_minute: 300 },
    },
  });
}
