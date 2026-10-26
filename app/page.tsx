import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { cfg } from "@/lib/config";
import Chat from "@/components/Chat";

export default async function Home() {
  const uid = await getUserId();
  if (!uid) redirect("/sign-in");
  return <Chat me={uid} pusherKey={cfg.pusher.key} pusherCluster={cfg.pusher.cluster} />;
}
