import { createClerkClient } from "@clerk/nextjs/server";
import { cfg } from "./config";
export const clerk = createClerkClient({
  publishableKey: cfg.clerk.publishableKey,
  secretKey: cfg.clerk.secretKey,
});
