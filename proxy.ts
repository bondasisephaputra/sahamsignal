import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection.
 *
 * This runs before the page renders and can only do cheap, cookie-level work -
 * it cannot touch the database, because `proxy.ts` is not guaranteed to share
 * state with the route handlers and may run on a different runtime.
 *
 * Therefore the real gate is the session check inside every protected page
 * (`app/dashboard/layout.tsx`) and inside every protected route handler
 * (`requireUser`). Proxy is only a convenience redirect that avoids rendering
 * a shell the user cannot use.
 */

const SESSION_COOKIE = "sahamsignal_session";

export function proxy(request: NextRequest): NextResponse {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  const isProtectedArea = pathname.startsWith("/dashboard");
  const isAuthPage = pathname === "/login" || pathname === "/register";

  // Signed-in users have no reason to see the login screen.
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // No session and trying to reach the app -> send to login, remembering where
  // they were headed so we can bounce them back after authenticating.
  if (!hasSession && isProtectedArea) {
    const url = new URL("/login", request.url);
    if (pathname !== "/dashboard") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Match every route except Next internals and static files. Path-to-regexp
   * syntax as of Next 16 (the older `.*` form is deprecated).
   */
  matcher: ["/((?!_next/|api/|favicon.ico|.*\\..*).*)"],
};