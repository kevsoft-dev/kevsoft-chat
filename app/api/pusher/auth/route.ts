import { getUserId } from "@/lib/auth";
import { pusher } from "@/lib/pusher";

// Setiap user hanya boleh subscribe ke channel miliknya sendiri.
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const form = new URLSearchParams(await req.text());
  const socketId = form.get("socket_id") ?? "";
  const channel = form.get("channel_name") ?? "";
  if (!/^\d+\.\d+$/.test(socketId)) return new Response("Bad request", { status: 400 });
  if (channel !== `private-user-${uid}`) return new Response("Forbidden", { status: 403 });

  return Response.json(pusher.authorizeChannel(socketId, channel));
}
