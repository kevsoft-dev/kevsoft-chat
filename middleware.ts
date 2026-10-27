import { cfg } from "./lib/config";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sso-callback(.*)", "/api/auth/otp/(.*)", "/api/health"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
}, { publishableKey: cfg.clerk.publishableKey, secretKey: cfg.clerk.secretKey });

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ico|woff2?)).*)", "/(api|trpc)(.*)"],
};
