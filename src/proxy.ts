import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/admin-session";
import { SESSION_COOKIE } from "@/lib/auth/session";

const PUBLIC_TENANT_PATHS = ["/", "/login", "/register"];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // /admin/** is a fully separate auth zone (platform operator, not a hotel
  // staff account) — checked first so it never falls through to the
  // tenant-session logic below.
  if (pathname.startsWith("/admin")) {
    const isAdminAuthenticated = !!req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const isAdminLoginPath = pathname === "/admin/login";

    if (!isAdminAuthenticated && !isAdminLoginPath) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    if (isAdminAuthenticated && isAdminLoginPath) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  const isAuthenticated = !!req.cookies.get(SESSION_COOKIE)?.value;
  const isPublicPath = PUBLIC_TENANT_PATHS.includes(pathname);

  if (!isAuthenticated && !isPublicPath) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isPublicPath) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
