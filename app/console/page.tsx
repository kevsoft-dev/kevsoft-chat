import { notFound, redirect } from "next/navigation";
import { gate } from "@/lib/ghosh";
import GhConsole from "@/components/GhConsole";

export const dynamic = "force-dynamic";
export const metadata = { title: "CONSOLE · KEVSOFT-CHAT", description: "—", robots: { index: false, follow: false, nocache: true, noarchive: true }, referrer: "no-referrer" as const };

// Hanya owner utama. Akun lain mendapat 404 biasa (tidak ada petunjuk bahwa halaman ini ada).
export default async function ConsoleRoute() {
  let g: Awaited<ReturnType<typeof gate>> = null;
  try { g = await gate(); } catch { notFound(); }
  if (!g) redirect("/sign-in?next=/console");
  if (!g.root) notFound();
  return <GhConsole />;
}
