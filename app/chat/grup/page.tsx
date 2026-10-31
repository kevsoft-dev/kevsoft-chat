import { ChatEntry } from "@/lib/chatEntry";

export const dynamic = "force-dynamic";

// /chat/grup = daftar chat, tab Grup
export default async function GroupList() {
  return ChatEntry({ next: "/chat/grup" });
}
