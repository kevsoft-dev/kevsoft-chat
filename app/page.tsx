import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

// "/" hanya penghubung. Tautan lama seperti /?open=, /?dm=, /?reset=1, /?news= diteruskan ke /chat.
// Sudah login -> langsung ke chat (tidak lagi ke beranda). Belum login -> /home.
export default async function Root({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const keep = ["dm", "open", "reset", "news"].filter((k) => typeof sp[k] === "string" && sp[k]);
  if (keep.length) redirect(`/chat?${keep.map((k) => `${k}=${encodeURIComponent(sp[k] as string)}`).join("&")}`);
  let authed = false;
  try { authed = !!(await getUserId()); } catch {}
  redirect(authed ? "/chat" : "/home");
}
