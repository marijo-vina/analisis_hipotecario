import { describe, expect, it } from "vitest";
import { readPmGates } from "./pm-gates-view";
import type { AnalysisRun } from "@/app/lib/definitions";

function runWith(pmGates: unknown): AnalysisRun {
  return {
    id: "run-1",
    executionStatus: "COMPLETED",
    outcome: "PARTIAL",
    detail: {
      sources: [],
      fields: [],
      ruleResults: [
        {
          ruleId: "pm-gates",
          outcome: "PARTIAL",
          severity: "WARNING",
          detail: { sources: [], fields: [], pmGates: pmGates as never },
          alerts: [],
        },
      ],
    },
    triggeredBy: "advisor",
    createdAt: "2026-10-22T00:00:00.000Z",
  };
}

describe("readPmGates", () => {
  it("reads the bank gates stored on the analysis run", () => {
    const gates = readPmGates(
      runWith({
        banks: [{ bankCode: "SANTANDER", status: "VIABLE", locks: [] }],
        companyIdentity: "PASS",
        identityLocks: [],
        prohibitedActivity: null,
        ageExceeded: false,
      }),
    );

    expect(gates?.banks[0].bankCode).toBe("SANTANDER");
  });

  it("returns null when the run has no persona moral gates", () => {
    const run = runWith(undefined);
    run.detail.ruleResults = [];
    expect(readPmGates(run)).toBeNull();
  });
});
