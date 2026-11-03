import { describe, expect, it } from "vitest";
import { showsDepositReviewQueue } from "./deposit-review";

describe("showsDepositReviewQueue", () => {
  it("hides the queue when the statement does not match the cover", () => {
    expect(showsDepositReviewQueue("CRITICAL_DISCREPANCY")).toBe(false);
  });

  it("keeps the queue when the cover matches", () => {
    expect(showsDepositReviewQueue("MATCHED")).toBe(true);
    expect(showsDepositReviewQueue("MINOR_DIFFERENCE")).toBe(true);
    expect(showsDepositReviewQueue(undefined)).toBe(true);
  });
});
