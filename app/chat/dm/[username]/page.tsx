import { redirect } from "next/navigation";
import { ChatEntry } from "@/lib/chatEntry";
import { USERNAME_RE, RESERVED } from "@/lib/mentions";

export const dynamic = "force-dynamic";

// /chat/dm/{username} = chat pribadi dengan @username
export default async function DmChat({ params }: { params: Promise<{ username: string }> }) {
  const raw = decodeURIComponent((await params).username ?? "").replace(/^@/, "").toLowerCase().trim();
  if (!USERNAME_RE.test(raw) || RESERVED.includes(raw)) redirect("/chat");
  return ChatEntry({ next: `/chat/dm/${raw}` });
}
