import { describe, expect, it } from "vitest";
import { tokenExpired } from "./token-expiry";

function tokenWithExp(exp: number): string {
  const payload = btoa(JSON.stringify({ exp }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${payload}.sig`;
}

describe("tokenExpired", () => {
  it("is expired when exp is in the past", () => {
    expect(tokenExpired(tokenWithExp(1), 2_000)).toBe(true);
  });

  it("is valid when exp is in the future", () => {
    expect(tokenExpired(tokenWithExp(5), 2_000)).toBe(false);
  });
});
