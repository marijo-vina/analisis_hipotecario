import { describe, expect, it } from "vitest";
import { parseArticlesDocument } from "./articles-view";
import type { Document } from "@/app/lib/definitions";
import {
  companyIdentity,
  comparisonSummaryKind,
  financialPanel,
  identityColumnKeys,
  identityHeading,
  pmActaHeadline,
  pmBankWindowCopy,
  pmBaseSelectable,
  pmDetailCopy,
  showsBankComparison,
} from "./pm-expediente-view";

function act(id: string, extractedData: Record<string, unknown>): Document {
  return {
    id,
    originalName: `${id}.pdf`,
    documentType: { code: String(extractedData.documentType), name: "Acta" },
    documentStatus: { code: "PROCESSED", name: "Procesado" },
    extractedData,
  } as Document;
}

describe("financialPanel", () => {
  it("keeps persona moral on the calculation tab", () => {
    expect(financialPanel("PM")).toBe("pm");
    expect(financialPanel("PFAE")).toBe("pfae");
    expect(financialPanel("SALARIED")).toBe("salaried");
    expect(showsBankComparison("PM")).toBe(true);
  });
});

describe("identity columns", () => {
  it("labels the shareholder comparison and leaves payroll out of persona moral", () => {
    expect(identityHeading("PM")).toBe("Identidad del socio");
    expect(identityColumnKeys("PM")).toEqual([
      "official-id",
      "bank-statement",
      "credit-bureau",
      "client",
    ]);
    expect(identityColumnKeys("PFAE")).toContain("csf");
    expect(identityColumnKeys("SALARIED")).toContain("payroll");
    expect(identityColumnKeys("PM")).not.toContain("payroll");
  });
});

describe("companyIdentity", () => {
  it("treats the legal suffix as the same company name", () => {
    const view = companyIdentity([
      {
        owner: "COMPANY",
        documentType: { code: "CSF" },
        extractedData: {
          taxpayer: { fullName: "ALIMENTOS RAPIDOS PENINSULARES SA DE CV", rfc: "ARP010101AAA" },
        },
      },
      {
        owner: "COMPANY",
        documentType: { code: "ARTICLES_OF_INCORPORATION" },
        extractedData: {
          documentType: "ARTICLES_OF_INCORPORATION",
          legalName: "ALIMENTOS RAPIDOS PENINSULARES",
          rfc: "ARP010101AAA",
        },
      },
    ]);

    expect(view.nameStatus).toBe("MATCH");
    expect(view.rfcStatus).toBe("MATCH");
    expect(view.legalName.acta).toBe("ALIMENTOS RAPIDOS PENINSULARES");
    expect(view.legalName.csf).toContain("SA DE CV");
  });

  it("flags a company name that does not match", () => {
    const view = companyIdentity([
      {
        owner: "COMPANY",
        documentType: { code: "CSF" },
        extractedData: { taxpayer: { fullName: "OTRA EMPRESA SA DE CV" } },
      },
      {
        owner: "COMPANY",
        documentType: { code: "CREDIT_BUREAU_REPORT" },
        extractedData: { borrower: { fullName: "ALIMENTOS RAPIDOS PENINSULARES" } },
      },
    ]);

    expect(view.nameStatus).toBe("MISMATCH");
  });
});

describe("pmActaHeadline", () => {
  it("reads the official share, years, and deed from the inscribed acta", () => {
    const docs = [
      parseArticlesDocument(act("constitutive", {
        documentType: "ARTICLES_OF_INCORPORATION",
        actKind: "CONSTITUTIVE",
        legalName: "ALIMENTOS RAPIDOS",
        deedNumber: "12480",
        incorporationDate: "2014-03-02",
        applicantShareholderName: "JUAN ANTONIO FRIAS FUENTES",
        applicantSharePercentage: 51,
        shareholders: [{ name: "JUAN ANTONIO FRIAS FUENTES", percentage: 51 }],
        registry: { date: "2014-04-01" },
      })),
    ].filter((doc) => doc != null);

    const headline = pmActaHeadline(docs);

    expect(headline.shareLabel).toBe("51%");
    expect(headline.incorporationLabel).toBe("2014");
    expect(headline.entryLabel).toBe("2014");
    expect(headline.deedLabel).toBe("12480");
    expect(headline.sharePercentage).toBe(51);
    expect(headline.note).toBe("El porcentaje de la comparativa sale de esta acta.");
  });

  it("says the acta is missing when there is no shareholder table", () => {
    const headline = pmActaHeadline([]);
    expect(headline.shareLabel).toBe("Sin porcentaje");
    expect(headline.sharePercentage).toBeNull();
    expect(headline.note).toBe("Falta el acta con cuadro accionario.");
  });
});

describe("pm income window", () => {
  it("keeps a short statement window selectable and says how many months exist", () => {
    expect(pmBaseSelectable({ valid: true, invalidReason: null })).toBe(true);
    expect(pmBaseSelectable({ valid: false, invalidReason: "TAX_LOSS" })).toBe(false);
    expect(pmBankWindowCopy({
      windowMonths: 12,
      monthsUsed: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"],
      statementNotice: "Faltan estados de cuenta para completar 12 meses. Hay 6 de 12.",
    })).toBe("Promedio de los 6 meses que hay. El giro pide 12.");
  });
});

describe("comparison copy", () => {
  it("uses the payroll summary for asalariado and the sent income for persona moral", () => {
    expect(comparisonSummaryKind("SALARIED")).toBe("payroll");
    expect(comparisonSummaryKind("PM")).toBe("business");
    expect(comparisonSummaryKind("PFAE")).toBe("business");
  });

  it("describes each closed persona moral formula from the persisted factor", () => {
    expect(pmDetailCopy({
      bankCode: "SANTANDER",
      incomeSource: "BANK_STATEMENTS",
      appliedFactor: "0.50",
      debtCommitmentFactor: "0.50",
      sharePercentage: 51,
      matchedNativeLabel: null,
    })).toEqual([
      "Estados de la empresa × 0.50 × 51% × CE 50%.",
      "Resta la deuda de la empresa antes del CE y la del socio al final.",
    ]);

    expect(pmDetailCopy({
      bankCode: "SCOTIABANK",
      incomeSource: "TAX_RETURN",
      appliedFactor: null,
      debtCommitmentFactor: "0.40",
      sharePercentage: 51,
      matchedNativeLabel: null,
    })).toEqual([
      "Scotiabank usa los estados de la empresa, aunque la base enviada sea la declaración.",
      "Estados × 51% × 0.40.",
      "No resta la deuda de la empresa.",
    ]);

    expect(pmDetailCopy({
      bankCode: "BANORTE",
      incomeSource: "BANK_STATEMENTS",
      appliedFactor: "0.40",
      debtCommitmentFactor: "0.60",
      sharePercentage: 51,
      matchedNativeLabel: null,
    })).toEqual([
      "Promedio de los últimos 6 meses × 0.40 × 51% × CE 60%.",
      "La casilla de cliente Banorte no está marcada.",
      "Resta la deuda de la empresa y, al final, la del socio.",
    ]);

    expect(pmDetailCopy({
      bankCode: "HSBC",
      incomeSource: "BANK_STATEMENTS",
      appliedFactor: "0.30",
      debtCommitmentFactor: "0.50",
      sharePercentage: 51,
      matchedNativeLabel: null,
    })).toEqual([
      "Estados de la empresa × 0.30 × 51% × CE 50%.",
      "Resta solo la deuda del socio.",
    ]);

    expect(pmDetailCopy({
      bankCode: "BANREGIO",
      incomeSource: "BANK_STATEMENTS",
      appliedFactor: "1.00",
      debtCommitmentFactor: "0.50",
      sharePercentage: 51,
      matchedNativeLabel: "Accionista",
    })).toEqual([
      "Últimos 3 meses × 100% × 50%.",
      "Resta la deuda de la empresa y la del socio.",
    ]);
  });
});
