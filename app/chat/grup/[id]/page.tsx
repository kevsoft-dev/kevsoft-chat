import { ChatEntry } from "@/lib/chatEntry";

export const dynamic = "force-dynamic";

// /chat/grup/{id} = grup atau Komunitas Kevsoft (id percakapan; handle grup juga diterima)
export default async function GroupChat({ params }: { params: Promise<{ id: string }> }) {
  const id = ((await params).id ?? "").replace(/[^a-zA-Z0-9_.-]/g, "");
  return ChatEntry({ next: `/chat/grup/${id}` });
}
