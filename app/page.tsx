import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// "/" hanya penghubung. Tautan lama seperti /?open=, /?dm=, /?reset=1, /?news= diteruskan ke /chat; selain itu ke /home.
export default async function Root({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const keep = ["dm", "open", "reset", "news"].filter((k) => typeof sp[k] === "string" && sp[k]);
  if (keep.length) redirect(`/chat?${keep.map((k) => `${k}=${encodeURIComponent(sp[k] as string)}`).join("&")}`);
  redirect("/home");
}
