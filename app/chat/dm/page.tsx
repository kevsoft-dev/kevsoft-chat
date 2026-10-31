import { ChatEntry } from "@/lib/chatEntry";

export const dynamic = "force-dynamic";

// /chat/dm = daftar chat, tab Pribadi
export default async function DmList() {
  return ChatEntry({ next: "/chat/dm" });
}
