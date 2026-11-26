/** True when the JWT `exp` claim is missing or already in the past. */
export function tokenExpired(token: string, nowMs = Date.now()): boolean {
  const part = token.split(".")[1];
  if (!part) return true;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp !== "number" || payload.exp * 1000 <= nowMs;
  } catch {
    return false;
  }
}
