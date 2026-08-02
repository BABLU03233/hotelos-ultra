import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/admin-session";
import { verifyAdminSession } from "@/lib/auth/admin-jwt";
import { verifySession } from "@/lib/auth/jwt";
import { SESSION_COOKIE } from "@/lib/auth/session";

const PUBLIC_TENANT_PATHS = ["/", "/login", "/register"];

// Proxy defaults to the Node.js runtime as of Next 16 (not Edge), so a real
// jsonwebtoken verify() here is fine — deliberately checking validity, not
// just presence: a cookie can outlive its token (expiry, a rotated
// JWT_SECRET) while the browser still holds it. Checking presence only
// caused exactly this bug once: /login sees the stale cookie and bounces to
// /dashboard, the page-level session check there properly rejects it and
// bounces back to /login, forever (ERR_TOO_MANY_REDIRECTS).
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // /admin/** is a fully separate auth zone (platform operator, not a hotel
  // staff account) — checked first so it never falls through to the
  // tenant-session logic below.
  if (pathname.startsWith("/admin")) {
    const adminToken = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const isAdminAuthenticated = !!adminToken && !!verifyAdminSession(adminToken);
    const isAdminLoginPath = pathname === "/admin/login";

    if (!isAdminAuthenticated && !isAdminLoginPath) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    if (isAdminAuthenticated && isAdminLoginPath) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
  const isAuthenticated = !!sessionToken && !!verifySession(sessionToken);
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
