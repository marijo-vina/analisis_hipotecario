import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { tokenExpired } from "@/app/lib/token-expiry";

/**
 * Optimistic route guard — runs at the edge before any page render.
 *
 * - /dashboard/*  without a usable token → redirect to /login (307)
 * - /login        with a usable token    → redirect to /dashboard (307)
 * An expired token is cleared. Otherwise /login sends the browser to
 * /dashboard and /dashboard sends it back, until Chromium gives up with
 * ERR_TOO_MANY_ACCEPT_CH_RESTARTS.
 */
function clearToken(response: NextResponse): NextResponse {
  response.cookies.set("token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
  return response;
}

export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Read the token cookie (same cookie name used by session.ts)
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const expired = Boolean(token && tokenExpired(token));

  // Rule 1: dashboard routes require a token that has not expired
  if (pathname.startsWith("/dashboard") && !token) {
    return NextResponse.redirect(new URL("/login", req.nextUrl), 307);
  }
  if (pathname.startsWith("/dashboard") && expired) {
    return clearToken(
      NextResponse.redirect(new URL("/login?reason=expired", req.nextUrl), 307),
    );
  }

  // Rule 2: already authenticated users on /login or /register go to dashboard
  if ((pathname === "/login" || pathname === "/register") && token) {
    if (expired || req.nextUrl.searchParams.get("reason") === "expired") {
      return clearToken(NextResponse.next());
    }
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl), 307);
  }

  return NextResponse.next();
}

/** Only run the proxy on the routes listed below. */
export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
