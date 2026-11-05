import { describe, expect, it } from "vitest";
import {
  isAutomaticallyDiscardedDeposit,
  showsDepositReviewQueue,
} from "./deposit-review";

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

describe("isAutomaticallyDiscardedDeposit", () => {
  it("hides own-account transfers and every other automatic discard", () => {
    expect(
      isAutomaticallyDiscardedDeposit({
        classification: "TRASH",
        reason: "Traspaso entre cuentas propias",
      }),
    ).toBe(true);
    expect(
      isAutomaticallyDiscardedDeposit({
        classification: "TRASH",
        reason: "SPEI devuelto, no es ingreso",
      }),
    ).toBe(true);
    expect(
      isAutomaticallyDiscardedDeposit({
        classification: "TRASH",
        reason: null,
      }),
    ).toBe(true);
  });

  it("keeps a discard the advisor made herself", () => {
    expect(
      isAutomaticallyDiscardedDeposit({
        classification: "TRASH",
        reason: "Descartado manualmente por la asesora",
      }),
    ).toBe(false);
  });

  it("keeps income and deposits that still need review", () => {
    expect(
      isAutomaticallyDiscardedDeposit({
        classification: "VALID",
        reason: "Ingreso comercial",
      }),
    ).toBe(false);
    expect(
      isAutomaticallyDiscardedDeposit({
        classification: "NEEDS_REVIEW",
        reason: "Depósito de alto monto sin concepto comercial evidente",
      }),
    ).toBe(false);
  });
});
