import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifyToken } from "./lib/token";
import { configIssue } from "./lib/config";

const PUBLIC = [
  /^\/sign-in/,
  /^\/api\/auth\//,
  /^\/api\/health$/,
  /^\/api\/avatar\//, // foto profil publik
  /^\/api\/banner\//, // foto sampul publik
];

const RESERVED_PATH = new Set([
  "sign-in", "api", "u", "dm", "g", "news", "_next", "favicon.ico", "robots.txt",
  "health", "console", "admin", "static", "assets",
]);

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (configIssue) return new NextResponse(configIssue, { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  // Anti-CSRF: permintaan yang mengubah data harus berasal dari origin yang sama.
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin)
      return new NextResponse("Forbidden (cross-origin)", { status: 403 });
    if (!origin && req.headers.get("sec-fetch-site") === "cross-site")
      return new NextResponse("Forbidden (cross-site)", { status: 403 });
  }
  const authed = await verifyToken(req.cookies.get(COOKIE)?.value);

  let path = pathname;
  try { path = decodeURIComponent(pathname); } catch {}

  // /@user → /dm/user (boleh tanpa login: lihat profil + Chat now)
  const at = path.match(/^\/@([a-z0-9_][a-z0-9_.-]{1,18}[a-z0-9_])\/?$/i);
  if (at) {
    const url = req.nextUrl.clone();
    url.pathname = `/dm/${at[1].toLowerCase()}`;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // /{username} → /u/{username} (profil publik)
  const bare = path.match(/^\/([a-z0-9_][a-z0-9_.-]{1,18}[a-z0-9_])\/?$/i);
  if (bare) {
    const name = bare[1].toLowerCase();
    if (!RESERVED_PATH.has(name) && name !== "kev-ai") {
      const url = req.nextUrl.clone();
      url.pathname = `/u/${name}`;
      return NextResponse.rewrite(url);
    }
  }

  // /u/* dan /dm/* boleh tanpa login
  if (path.startsWith("/u/") || path.startsWith("/dm/")) {
    return NextResponse.next();
  }

  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (authed) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ico|woff2?)).*)", "/(api|trpc)(.*)"],
};
