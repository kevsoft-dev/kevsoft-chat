import Pusher from "pusher";
import { cfg } from "./config";
export const pusher = new Pusher({
  appId: cfg.pusher.appId,
  key: cfg.pusher.key,
  secret: cfg.pusher.secret,
  cluster: cfg.pusher.cluster,
  useTLS: true,
});
