import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Optimistic route guard — runs at the edge before any page render.
 *
 * - /dashboard/*  without token → redirect to /login (307)
 * - /login        with token    → redirect to /dashboard (307)
 * - Everything else passes through.
 */
export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Read the token cookie (same cookie name used by session.ts)
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  // Rule 1: dashboard routes require authentication
  if (pathname.startsWith("/dashboard") && !token) {
    return NextResponse.redirect(new URL("/login", req.nextUrl), 307);
  }

  // Rule 2: already authenticated users on /login or /register go to dashboard
  if ((pathname === "/login" || pathname === "/register") && token) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl), 307);
  }

  return NextResponse.next();
}

/** Only run the proxy on the routes listed below. */
export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
