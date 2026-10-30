import { redirect } from "next/navigation";
import { gate } from "@/lib/ghosh";
import Ghosh from "@/components/Ghosh";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "KEVSOFT-CHAT",
  description: "—",
  robots: { index: false, follow: false, nocache: true, noarchive: true },
  referrer: "no-referrer" as const,
};

export default async function GhoshRoute() {
  let g: Awaited<ReturnType<typeof gate>> = null;
  try { g = await gate(); } catch { /* DB bermasalah: klien menampilkan error */ }
  if (!g) redirect("/sign-in?next=/ghosh");
  const state = g.root ? "root" : g.lockdown && g.status === "approved" ? "lockdown" : g.status;
  return <Ghosh initial={state} root={g.root} />;
}
