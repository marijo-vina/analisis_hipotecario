import { describe, expect, it } from "vitest";
import type { Document } from "@/app/lib/definitions";
import { parseBuro } from "@/app/lib/extraction";
import {
  computeGlobalUtilization,
  computeRowUtilization,
  getUtilizationBand,
  isInScope,
  maskLastFour,
} from "./bureau-utilization";

type CreditStub = {
  classification: string;
  creditType?: string | null;
  currentBalance?: number | null;
  creditLimit?: number | null;
  isClosed?: boolean;
  accountNumber?: string | null;
  institution?: string | null;
  rawTextReference?: string | null;
};

function credit(overrides: Partial<CreditStub> = {}): CreditStub {
  return {
    classification: "REVOLVING",
    creditType: "Tarjeta de crédito",
    currentBalance: 3000,
    creditLimit: 10000,
    isClosed: false,
    accountNumber: null,
    institution: "BBVA",
    rawTextReference: null,
    ...overrides,
  };
}

describe("isInScope", () => {
  it("includes REVOLVING regardless of creditType", () => {
    expect(isInScope(credit({ creditType: "Línea de crédito" }))).toBe(true);
  });

  it("includes DEPARTMENT_STORE only when creditLimit > 0", () => {
    expect(
      isInScope(
        credit({ classification: "DEPARTMENT_STORE", creditLimit: 8000 }),
      ),
    ).toBe(true);
    expect(
      isInScope(
        credit({ classification: "DEPARTMENT_STORE", creditLimit: 0 }),
      ),
    ).toBe(false);
    expect(
      isInScope(
        credit({ classification: "DEPARTMENT_STORE", creditLimit: null }),
      ),
    ).toBe(false);
  });

  it("includes UNKNOWN and OTHER when creditType matches /tarjeta/i", () => {
    expect(
      isInScope(
        credit({ classification: "UNKNOWN", creditType: "Tarjeta de crédito" }),
      ),
    ).toBe(true);
    expect(
      isInScope(
        credit({ classification: "OTHER", creditType: "Tarjeta de crédito" }),
      ),
    ).toBe(true);
    expect(
      isInScope(
        credit({ classification: "OTROS", creditType: "TARJETA DEPARTAMENTAL" }),
      ),
    ).toBe(true);
    expect(
      isInScope(
        credit({ classification: "FIXED_PAYMENT", creditType: "Tarjeta de crédito" }),
      ),
    ).toBe(true);
    expect(
      isInScope(
        credit({ classification: "UNKNOWN", creditType: "Préstamo personal" }),
      ),
    ).toBe(false);
    expect(
      isInScope(credit({ classification: "UNKNOWN", creditType: null })),
    ).toBe(false);
  });

  it.each(["MORTGAGE", "AUTO"])(
    "excludes %s even when creditType says tarjeta",
    (classification) => {
      expect(
        isInScope(
          credit({ classification, creditType: "Tarjeta de crédito" }),
        ),
      ).toBe(false);
    },
  );

  it("includes NON_BANK_SERVICE when creditType is a credit card", () => {
    expect(
      isInScope(
        credit({
          classification: "NON_BANK_SERVICE",
          creditType: "TARJETA DE CRÉDITO",
          institution: "AMEX",
          creditLimit: 150000,
        }),
      ),
    ).toBe(true);
    expect(
      isInScope(
        credit({
          classification: "NON_BANK_SERVICE",
          creditType: "LÍNEA DE CRÉDITO",
          institution: "TELCEL MER",
          creditLimit: 1347,
        }),
      ),
    ).toBe(false);
  });

  it("excludes PERSONAL_LOAN without tarjeta in creditType", () => {
    expect(
      isInScope(
        credit({
          classification: "PERSONAL_LOAN",
          creditType: "Préstamo personal",
        }),
      ),
    ).toBe(false);
  });
});

describe("computeRowUtilization", () => {
  it("shows rounded rate and band for an open in-scope card", () => {
    const result = computeRowUtilization(
      credit({ currentBalance: 3000, creditLimit: 10000 }),
    );
    expect(result.display).toBe("30%");
    expect(result.percent).toBe(30);
    expect(result.band?.label).toBe("Muy buena");
  });

  it("shows rounded rate for an open AMEX card in the non-bank table", () => {
    const result = computeRowUtilization(
      credit({
        classification: "NON_BANK_SERVICE",
        creditType: "TARJETA DE CRÉDITO",
        institution: "AMEX",
        currentBalance: 30283,
        creditLimit: 150000,
        isClosed: false,
      }),
    );
    expect(result.display).toBe("20%");
    expect(result.band?.label).toBe("Muy buena");
  });

  it("dashes excluded, closed, and null-balance rows (null is not 0%)", () => {
    expect(
      computeRowUtilization(credit({ classification: "MORTGAGE" })).display,
    ).toBe("—");
    expect(
      computeRowUtilization(
        credit({ isClosed: true, currentBalance: 3000, creditLimit: 10000 }),
      ).display,
    ).toBe("—");
    const nullBalance = computeRowUtilization(
      credit({ currentBalance: null, creditLimit: 10000 }),
    );
    expect(nullBalance.display).toBe("—");
    expect(nullBalance.percent).toBeNull();
  });

  it("dashes null or zero limit and omits them from a percent", () => {
    expect(
      computeRowUtilization(
        credit({ currentBalance: 3000, creditLimit: null }),
      ).display,
    ).toBe("—");
    expect(
      computeRowUtilization(
        credit({ currentBalance: 3000, creditLimit: 0 }),
      ).display,
    ).toBe("—");
  });

  it("allows over-limit and bands 91+ as Muy crítico", () => {
    const result = computeRowUtilization(
      credit({ currentBalance: 11000, creditLimit: 10000 }),
    );
    expect(result.display).toBe("110%");
    expect(result.percent).toBe(110);
    expect(result.band?.label).toBe("Muy crítico");
  });

  it("treats a zero balance as 0% Excelente, not a dash", () => {
    const result = computeRowUtilization(
      credit({ currentBalance: 0, creditLimit: 10000 }),
    );
    expect(result.display).toBe("0%");
    expect(result.percent).toBe(0);
    expect(result.band?.label).toBe("Excelente");
  });

  it("rounds display percent before banding", () => {
    // 1049 / 10000 = 10.49% → 10% Excelente
    const down = computeRowUtilization(
      credit({ currentBalance: 1049, creditLimit: 10000 }),
    );
    expect(down.percent).toBe(10);
    expect(down.band?.label).toBe("Excelente");
    // 1050 / 10000 = 10.5% → 11% Muy buena
    const up = computeRowUtilization(
      credit({ currentBalance: 1050, creditLimit: 10000 }),
    );
    expect(up.percent).toBe(11);
    expect(up.band?.label).toBe("Muy buena");
  });
});

describe("computeGlobalUtilization", () => {
  it("weights by sum(balances)/sum(limits), not the average of per-card rates", () => {
    const result = computeGlobalUtilization([
      credit({ currentBalance: 5000, creditLimit: 5000 }),
      credit({ currentBalance: 10000, creditLimit: 100000 }),
    ]);
    // 15000 / 105000 = 14.285…% → 14% Muy buena (not avg of 100% and 10%)
    expect(result.display).toBe("14%");
    expect(result.percent).toBe(14);
    expect(result.band?.label).toBe("Muy buena");
  });

  it("excludes closed, out-of-scope, null-balance, and zero-limit cards", () => {
    const result = computeGlobalUtilization([
      credit({ currentBalance: 5000, creditLimit: 5000 }),
      credit({ isClosed: true, currentBalance: 9000, creditLimit: 9000 }),
      credit({ classification: "MORTGAGE", currentBalance: 800000, creditLimit: 1000000 }),
      credit({ currentBalance: null, creditLimit: 20000 }),
      credit({ currentBalance: 1000, creditLimit: 0 }),
    ]);
    expect(result.display).toBe("100%");
    expect(result.percent).toBe(100);
    expect(result.band?.label).toBe("Muy crítico");
  });

  it("returns a dash when the in-scope denominator is 0", () => {
    const result = computeGlobalUtilization([
      credit({ classification: "MORTGAGE", currentBalance: 100, creditLimit: 100 }),
      credit({ currentBalance: 50, creditLimit: 0 }),
    ]);
    expect(result.display).toBe("—");
    expect(result.percent).toBeNull();
  });
});

describe("getUtilizationBand", () => {
  it.each([
    [0, "Excelente"],
    [10, "Excelente"],
    [11, "Muy buena"],
    [30, "Muy buena"],
    [31, "Aceptable"],
    [50, "Aceptable"],
    [51, "Atención"],
    [70, "Atención"],
    [71, "Crítico"],
    [90, "Crítico"],
    [91, "Muy crítico"],
    [140, "Muy crítico"],
  ] as const)("maps %i%% to %s after rounding", (percent, label) => {
    expect(getUtilizationBand(percent).label).toBe(label);
  });
});

describe("maskLastFour", () => {
  it("masks accountNumber as **** plus last 4", () => {
    expect(maskLastFour(credit({ accountNumber: "82953660" }))).toBe(
      "****3660",
    );
  });

  it("falls back to a ≥4 digit run in institution, then rawTextReference", () => {
    expect(
      maskLastFour(
        credit({
          accountNumber: null,
          institution: "Visa 1234567890",
        }),
      ),
    ).toBe("****7890");
    expect(
      maskLastFour(
        credit({
          accountNumber: null,
          institution: "Liverpool",
          rawTextReference: "CTA 99887766 SALDO",
        }),
      ),
    ).toBe("****7766");
  });

  it("returns a dash when no ≥4-digit source exists", () => {
    expect(
      maskLastFour(
        credit({
          accountNumber: "12",
          institution: "HSBC 123",
          rawTextReference: "sin dígitos",
        }),
      ),
    ).toBe("—");
  });

  it("prefers accountNumber over institution and never returns the full number", () => {
    const masked = maskLastFour(
      credit({
        accountNumber: "82953660",
        institution: "Visa 1234567890",
      }),
    );
    expect(masked).toBe("****3660");
    expect(masked).not.toContain("82953660");
    expect(masked).not.toContain("1234567890");
  });
});

function bureauDocument(extractedData: Record<string, unknown>): Document {
  return {
    id: "doc-1",
    mortgageCaseId: "case-1",
    documentTypeId: 1,
    documentType: {
      id: 1,
      code: "CREDIT_BUREAU_REPORT",
      name: "Buró",
      isActive: true,
    },
    documentStatusId: 4,
    documentStatus: {
      id: 4,
      code: "PROCESSED",
      name: "Procesado",
      order: 4,
    },
    fileUrl: null,
    storagePath: null,
    mimeType: "application/pdf",
    sizeBytes: 1,
    originalName: "buro.pdf",
    uploadedById: "u1",
    extractedData,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("parseBuro accountNumber", () => {
  it("copies a stored accountNumber onto the parsed credit for last-4 masking", () => {
    const parsed = parseBuro([
      bureauDocument({
        credits: [
          {
            institution: "BBVA",
            classification: "REVOLVING",
            status: "ACTIVE",
            currentBalance: 3000,
            creditLimit: 10000,
            accountNumber: "82953660",
          },
        ],
      }),
    ]);
    expect(parsed?.credits).toHaveLength(1);
    expect(parsed!.credits[0].accountNumber).toBe("82953660");
    expect(maskLastFour(parsed!.credits[0])).toBe("****3660");
  });

  it("leaves accountNumber null when the stored field is missing", () => {
    const parsed = parseBuro([
      bureauDocument({
        credits: [
          {
            institution: "BBVA",
            classification: "REVOLVING",
            status: "ACTIVE",
            currentBalance: 3000,
            creditLimit: 10000,
          },
        ],
      }),
    ]);
    expect(parsed!.credits[0].accountNumber).toBeNull();
    expect(maskLastFour(parsed!.credits[0])).toBe("—");
  });
});
