import { describe, expect, it } from "vitest";
import { REASON_LABELS, getReasonLabel } from "./definitions";

describe("reason labels", () => {
  it("maps ACTIVITY_NOT_SUSCEPTIBLE to its Spanish label", () => {
    expect(REASON_LABELS.ACTIVITY_NOT_SUSCEPTIBLE).toBe(
      "Giro no susceptible de financiamiento",
    );
  });

  it("renders ACTIVITY_NOT_SUSCEPTIBLE through getReasonLabel", () => {
    expect(getReasonLabel("ACTIVITY_NOT_SUSCEPTIBLE")).toBe(
      "Giro no susceptible de financiamiento",
    );
  });
});
