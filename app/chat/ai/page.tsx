import { ChatEntry } from "@/lib/chatEntry";

export const dynamic = "force-dynamic";

// /chat/ai = chat dengan Kev-Ai
export default async function AiChat() {
  return ChatEntry({ next: "/chat/ai" });
}
