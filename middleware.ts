import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifyToken } from "./lib/token";

const PUBLIC = [/^\/sign-in/, /^\/api\/auth\//, /^\/api\/health$/];

const RESERVED_PATH = new Set([
  "sign-in", "api", "u", "dm", "_next", "favicon.ico", "robots.txt",
  "health", "console", "admin", "static", "assets",
]);

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = await verifyToken(req.cookies.get(COOKIE)?.value);

  // /@username → buka chat pribadi
  const at = pathname.match(/^\/@([a-z0-9_][a-z0-9_.-]{1,18}[a-z0-9_])\/?$/i);
  if (at) {
    if (!authed) {
      const url = req.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = "";
      return NextResponse.redirect(url);
    }
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("dm", at[1].toLowerCase());
    return NextResponse.rewrite(url);
  }

  // /{username} → halaman profil
  const bare = pathname.match(/^\/([a-z0-9_][a-z0-9_.-]{1,18}[a-z0-9_])\/?$/i);
  if (bare) {
    const name = bare[1].toLowerCase();
    if (!RESERVED_PATH.has(name) && name !== "kev-ai") {
      if (!authed) {
        const url = req.nextUrl.clone();
        url.pathname = "/sign-in";
        url.search = "";
        return NextResponse.redirect(url);
      }
      const url = req.nextUrl.clone();
      url.pathname = `/u/${name}`;
      return NextResponse.rewrite(url);
    }
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
