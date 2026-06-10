import "server-only";

import { cookies } from "next/headers";

const TOKEN_COOKIE = "token";

/**
 * Reads the JWT token cookie from the incoming request.
 * Returns `undefined` when the user is not authenticated.
 */
export async function getSession(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_COOKIE)?.value;
}

/**
 * Sets the JWT token as an httpOnly, SameSite=Lax cookie.
 * The `Secure` flag is only enabled in production.
 */
export async function createSession(token: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Deletes the token cookie, effectively logging the user out.
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_COOKIE);
}
