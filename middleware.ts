import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifyToken } from "./lib/token";

const PUBLIC = [/^\/sign-in/, /^\/api\/auth\//, /^\/api\/health$/];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (await verifyToken(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/sign-in"; url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ico|woff2?)).*)", "/(api|trpc)(.*)"],
};
