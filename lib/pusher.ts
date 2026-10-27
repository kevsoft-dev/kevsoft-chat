import Pusher from "pusher";
import { cfg } from "./config";

// Dibuat saat dipakai, supaya kunci Pusher yang kosong tidak membuat seluruh aplikasi error.
let inst: Pusher | null = null;
const get = () =>
  (inst ??= new Pusher({
    appId: cfg.pusher.appId,
    key: cfg.pusher.key,
    secret: cfg.pusher.secret,
    cluster: cfg.pusher.cluster,
    useTLS: true,
  }));

export const pusher = {
  trigger: (channels: string | string[], event: string, data: unknown) => get().trigger(channels, event, data),
  authorizeChannel: (socketId: string, channel: string) => get().authorizeChannel(socketId, channel),
};
