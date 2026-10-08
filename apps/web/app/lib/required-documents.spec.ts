import { describe, expect, it } from "vitest";
import {
  filterUploadableDocumentTypes,
  getDocumentCategories,
  getRequiredDocChecks,
  isRequiredDocReady,
  resolveUploadOwner,
} from "./required-documents";

type DocLike = {
  documentType: { code: string };
  documentStatus: { code: string };
  owner?: string | null;
};

function doc(
  code: string,
  status = "PROCESSED",
  owner?: string | null,
): DocLike {
  return {
    documentType: { code },
    documentStatus: { code: status },
    ...(owner !== undefined ? { owner } : {}),
  };
}

const CATALOG = [
  { id: 1, code: "INE", name: "INE" },
  { id: 2, code: "PASSPORT", name: "Pasaporte" },
  { id: 3, code: "PAYROLL_RECEIPT", name: "Nómina" },
  { id: 4, code: "BANK_STATEMENT", name: "Estado de cuenta" },
  { id: 5, code: "CREDIT_BUREAU_REPORT", name: "Buró" },
  { id: 6, code: "CREDIT_SCORE", name: "Mi Score" },
  { id: 7, code: "CSF", name: "CSF" },
  { id: 8, code: "TAX_RETURN", name: "Declaración anual" },
  { id: 9, code: "PROOF_OF_ADDRESS", name: "Comprobante de domicilio" },
  { id: 10, code: "ARTICLES_OF_INCORPORATION", name: "Acta constitutiva" },
];

describe("getRequiredDocChecks", () => {
  it("copies the current SALARIED checklist including PASSPORT and CREDIT_SCORE", () => {
    expect(getRequiredDocChecks("SALARIED")).toEqual([
      {
        key: "identity",
        label: "Identificación oficial (INE/Pasaporte)",
        codes: ["INE", "PASSPORT"],
      },
      {
        key: "payroll",
        label: "Recibo de nómina",
        codes: ["PAYROLL_RECEIPT"],
      },
      {
        key: "bank-statement",
        label: "Estado de cuenta bancario",
        codes: ["BANK_STATEMENT"],
      },
      {
        key: "credit-bureau",
        label: "Buró de crédito / Score",
        codes: ["CREDIT_BUREAU_REPORT", "CREDIT_SCORE"],
      },
    ]);
  });

  it("treats omitted personType as the SALARIED checklist", () => {
    expect(getRequiredDocChecks()).toEqual(getRequiredDocChecks("SALARIED"));
  });

  it("copies the current PFAE checklist (CSF + tax return, no payroll)", () => {
    expect(getRequiredDocChecks("PFAE")).toEqual([
      {
        key: "identity",
        label: "Identificación oficial (INE/Pasaporte)",
        codes: ["INE", "PASSPORT"],
      },
      {
        key: "csf",
        label: "Constancia de Situación Fiscal (CSF)",
        codes: ["CSF"],
      },
      {
        key: "tax-return",
        label: "Declaración anual",
        codes: ["TAX_RETURN"],
      },
      {
        key: "bank-statement",
        label: "Estado de cuenta bancario",
        codes: ["BANK_STATEMENT"],
      },
      {
        key: "credit-bureau",
        label: "Buró de crédito / Score",
        codes: ["CREDIT_BUREAU_REPORT", "CREDIT_SCORE"],
      },
    ]);
  });

  it("returns the PM dual checklist matching evaluatePm slots", () => {
    const checks = getRequiredDocChecks("PM");
    expect(checks).toEqual([
      {
        key: "shareholder-identity",
        label: "Identificación oficial (INE/Pasaporte)",
        codes: ["INE", "PASSPORT"],
        owner: "SHAREHOLDER",
        group: "SHAREHOLDER",
      },
      {
        key: "shareholder-credit-bureau",
        label: "Buró de crédito",
        codes: ["CREDIT_BUREAU_REPORT"],
        owner: "SHAREHOLDER",
        group: "SHAREHOLDER",
      },
      {
        key: "shareholder-csf",
        label: "Constancia de Situación Fiscal (CSF)",
        codes: ["CSF"],
        owner: "SHAREHOLDER",
        group: "SHAREHOLDER",
      },
      {
        key: "shareholder-bank-statement",
        label: "Estado de cuenta bancario",
        codes: ["BANK_STATEMENT"],
        owner: "SHAREHOLDER",
        group: "SHAREHOLDER",
      },
      {
        key: "shareholder-tax-return",
        label: "Declaración anual",
        codes: ["TAX_RETURN"],
        owner: "SHAREHOLDER",
        group: "SHAREHOLDER",
      },
      {
        key: "company-credit-bureau",
        label: "Buró de crédito",
        codes: ["CREDIT_BUREAU_REPORT"],
        owner: "COMPANY",
        group: "COMPANY",
      },
      {
        key: "company-csf",
        label: "Constancia de Situación Fiscal (CSF)",
        codes: ["CSF"],
        owner: "COMPANY",
        group: "COMPANY",
      },
      {
        key: "company-bank-statement",
        label: "Estado de cuenta bancario",
        codes: ["BANK_STATEMENT"],
        owner: "COMPANY",
        group: "COMPANY",
      },
      {
        key: "company-tax-return",
        label: "Declaración anual",
        codes: ["TAX_RETURN"],
        owner: "COMPANY",
        group: "COMPANY",
      },
      {
        key: "company-articles",
        label: "Acta constitutiva",
        codes: ["ARTICLES_OF_INCORPORATION"],
        owner: "COMPANY",
        group: "COMPANY",
      },
    ]);
  });
});

describe("isRequiredDocReady", () => {
  it("marks a SALARIED identity slot ready when PASSPORT is PROCESSED", () => {
    const identity = getRequiredDocChecks("SALARIED")[0];
    expect(isRequiredDocReady(identity, [doc("PASSPORT")])).toBe(true);
  });

  it("marks a SALARIED credit-bureau slot ready when CREDIT_SCORE is PROCESSED", () => {
    const bureau = getRequiredDocChecks("SALARIED").find(
      (check) => check.key === "credit-bureau",
    );
    if (!bureau) throw new Error("expected credit-bureau check");
    expect(isRequiredDocReady(bureau, [doc("CREDIT_SCORE")])).toBe(true);
  });

  it("does not mark a slot ready when the matching doc is only UPLOADED", () => {
    const identity = getRequiredDocChecks("SALARIED")[0];
    expect(
      isRequiredDocReady(identity, [doc("INE", "UPLOADED")]),
    ).toBe(false);
  });

  it("treats a missing owner as SHAREHOLDER for PM slots", () => {
    const shareholderCsf = getRequiredDocChecks("PM").find(
      (check) => check.key === "shareholder-csf",
    );
    if (!shareholderCsf) throw new Error("expected shareholder-csf check");
    expect(isRequiredDocReady(shareholderCsf, [doc("CSF")])).toBe(true);
    expect(
      isRequiredDocReady(shareholderCsf, [doc("CSF", "PROCESSED", null)]),
    ).toBe(true);
  });

  it("treats an unrecognized owner as SHAREHOLDER for PM slots", () => {
    const shareholderCsf = getRequiredDocChecks("PM").find(
      (check) => check.key === "shareholder-csf",
    );
    if (!shareholderCsf) throw new Error("expected shareholder-csf check");
    expect(
      isRequiredDocReady(shareholderCsf, [doc("CSF", "PROCESSED", "CLIENT")]),
    ).toBe(true);
  });

  it("does not let a COMPANY doc fill a SHAREHOLDER PM slot", () => {
    const shareholderCsf = getRequiredDocChecks("PM").find(
      (check) => check.key === "shareholder-csf",
    );
    if (!shareholderCsf) throw new Error("expected shareholder-csf check");
    expect(
      isRequiredDocReady(shareholderCsf, [
        doc("CSF", "PROCESSED", "COMPANY"),
      ]),
    ).toBe(false);
  });

  it("does not let CREDIT_SCORE fill the PM credit-bureau slot", () => {
    const shareholderBureau = getRequiredDocChecks("PM").find(
      (check) => check.key === "shareholder-credit-bureau",
    );
    if (!shareholderBureau) {
      throw new Error("expected shareholder-credit-bureau check");
    }
    expect(
      isRequiredDocReady(shareholderBureau, [
        doc("CREDIT_SCORE", "PROCESSED", "SHAREHOLDER"),
      ]),
    ).toBe(false);
    expect(
      isRequiredDocReady(shareholderBureau, [
        doc("CREDIT_BUREAU_REPORT", "PROCESSED", "SHAREHOLDER"),
      ]),
    ).toBe(true);
  });
});

describe("getDocumentCategories", () => {
  it("copies the current SALARIED browser categories", () => {
    expect(getDocumentCategories("SALARIED")).toEqual([
      { key: "identificacion", label: "Identificación", codes: ["INE", "PASSPORT"] },
      { key: "nomina", label: "Nómina", codes: ["PAYROLL_RECEIPT"] },
      { key: "estados-cuenta", label: "Estados de cuenta", codes: ["BANK_STATEMENT"] },
      {
        key: "buro",
        label: "Buró",
        codes: ["CREDIT_BUREAU_REPORT", "CREDIT_SCORE"],
      },
    ]);
  });

  it("copies the current PFAE browser categories", () => {
    expect(getDocumentCategories("PFAE")).toEqual([
      { key: "identificacion", label: "Identificación", codes: ["INE", "PASSPORT"] },
      { key: "csf", label: "CSF", codes: ["CSF"] },
      { key: "declaracion", label: "Declaración anual", codes: ["TAX_RETURN"] },
      { key: "estados-cuenta", label: "Estados de cuenta", codes: ["BANK_STATEMENT"] },
      {
        key: "buro",
        label: "Buró",
        codes: ["CREDIT_BUREAU_REPORT", "CREDIT_SCORE"],
      },
    ]);
  });

  it("returns PM categories split by owner without CREDIT_SCORE", () => {
    const categories = getDocumentCategories("PM");
    expect(categories).toEqual([
      {
        key: "shareholder-identificacion",
        label: "Identificación",
        codes: ["INE", "PASSPORT"],
        owner: "SHAREHOLDER",
      },
      {
        key: "shareholder-buro",
        label: "Buró",
        codes: ["CREDIT_BUREAU_REPORT"],
        owner: "SHAREHOLDER",
      },
      {
        key: "shareholder-csf",
        label: "CSF",
        codes: ["CSF"],
        owner: "SHAREHOLDER",
      },
      {
        key: "shareholder-estados-cuenta",
        label: "Estados de cuenta",
        codes: ["BANK_STATEMENT"],
        owner: "SHAREHOLDER",
      },
      {
        key: "shareholder-declaracion",
        label: "Declaración anual",
        codes: ["TAX_RETURN"],
        owner: "SHAREHOLDER",
      },
      {
        key: "company-buro",
        label: "Buró",
        codes: ["CREDIT_BUREAU_REPORT"],
        owner: "COMPANY",
      },
      {
        key: "company-csf",
        label: "CSF",
        codes: ["CSF"],
        owner: "COMPANY",
      },
      {
        key: "company-estados-cuenta",
        label: "Estados de cuenta",
        codes: ["BANK_STATEMENT"],
        owner: "COMPANY",
      },
      {
        key: "company-declaracion",
        label: "Declaración anual",
        codes: ["TAX_RETURN"],
        owner: "COMPANY",
      },
      {
        key: "company-acta",
        label: "Acta constitutiva",
        codes: ["ARTICLES_OF_INCORPORATION"],
        owner: "COMPANY",
      },
    ]);
  });
});

describe("filterUploadableDocumentTypes", () => {
  it("hides ARTICLES_OF_INCORPORATION, CSF, TAX_RETURN, and PROOF_OF_ADDRESS for SALARIED", () => {
    const codes = filterUploadableDocumentTypes(CATALOG, "SALARIED").map(
      (type) => type.code,
    );
    expect(codes).toContain("PAYROLL_RECEIPT");
    expect(codes).toContain("PASSPORT");
    expect(codes).not.toContain("ARTICLES_OF_INCORPORATION");
    expect(codes).not.toContain("CSF");
    expect(codes).not.toContain("TAX_RETURN");
    expect(codes).not.toContain("PROOF_OF_ADDRESS");
  });

  it("hides ARTICLES_OF_INCORPORATION and PAYROLL_RECEIPT for PFAE", () => {
    const codes = filterUploadableDocumentTypes(CATALOG, "PFAE").map(
      (type) => type.code,
    );
    expect(codes).toContain("CSF");
    expect(codes).toContain("TAX_RETURN");
    expect(codes).not.toContain("ARTICLES_OF_INCORPORATION");
    expect(codes).not.toContain("PAYROLL_RECEIPT");
    expect(codes).not.toContain("PROOF_OF_ADDRESS");
  });

  it("keeps ARTICLES_OF_INCORPORATION, CSF, and TAX_RETURN for PM", () => {
    const codes = filterUploadableDocumentTypes(CATALOG, "PM").map(
      (type) => type.code,
    );
    expect(codes).toContain("ARTICLES_OF_INCORPORATION");
    expect(codes).toContain("CSF");
    expect(codes).toContain("TAX_RETURN");
    expect(codes).toContain("PASSPORT");
    expect(codes).not.toContain("PAYROLL_RECEIPT");
    expect(codes).not.toContain("PROOF_OF_ADDRESS");
  });

  it("injects PASSPORT when the catalog does not include it", () => {
    const withoutPassport = CATALOG.filter((type) => type.code !== "PASSPORT");
    const codes = filterUploadableDocumentTypes(withoutPassport, "SALARIED").map(
      (type) => type.code,
    );
    expect(codes.filter((code) => code === "PASSPORT")).toEqual(["PASSPORT"]);
  });
});

describe("resolveUploadOwner", () => {
  it("returns undefined for SALARIED and PFAE uploads", () => {
    expect(resolveUploadOwner("SALARIED", "INE", "SHAREHOLDER")).toBeUndefined();
    expect(resolveUploadOwner("PFAE", "CSF", "COMPANY")).toBeUndefined();
    expect(resolveUploadOwner(undefined, "INE")).toBeUndefined();
  });

  it("returns SHAREHOLDER by default for PM uploads", () => {
    expect(resolveUploadOwner("PM", "CSF")).toBe("SHAREHOLDER");
    expect(resolveUploadOwner("PM", "BANK_STATEMENT", "SHAREHOLDER")).toBe(
      "SHAREHOLDER",
    );
  });

  it("returns COMPANY when the PM upload is for the company", () => {
    expect(resolveUploadOwner("PM", "CSF", "COMPANY")).toBe("COMPANY");
    expect(
      resolveUploadOwner("PM", "ARTICLES_OF_INCORPORATION", "SHAREHOLDER"),
    ).toBe("COMPANY");
  });
});
