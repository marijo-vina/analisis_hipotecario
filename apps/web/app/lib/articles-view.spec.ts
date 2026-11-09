import { describe, expect, it } from "vitest";
import { formatShareTenure, parseArticlesDocument, resolveVigentArticles } from "./articles-view";
import type { Document } from "@/app/lib/definitions";

function actDocument(
  id: string,
  extractedData: Record<string, unknown>,
): Document {
  return {
    id,
    originalName: `${id}.pdf`,
    documentType: { code: String(extractedData.documentType), name: "Acta" },
    documentStatus: { code: "PROCESSED", name: "Procesado" },
    extractedData,
  } as Document;
}

describe("formatShareTenure", () => {
  it("reads completed months as years and months", () => {
    expect(formatShareTenure(0)).toBe("menos de 1 mes");
    expect(formatShareTenure(1)).toBe("1 mes");
    expect(formatShareTenure(14)).toBe("1 año y 2 meses");
    expect(formatShareTenure(24)).toBe("2 años");
  });
});

describe("resolveVigentArticles", () => {
  it("takes the applicant percentage from the later inscribed amendment", () => {
    const docs = [
      parseArticlesDocument(actDocument("constitutive", {
        documentType: "ARTICLES_OF_INCORPORATION",
        actKind: "CONSTITUTIVE",
        legalName: "MODIEBO",
        incorporationDate: "1997-04-28",
        applicantShareholderName: "EDGARDO GONZALEZ HIGUERA",
        applicantSharePercentage: 50,
        shareholders: [{ name: "EDGARDO GONZALEZ HIGUERA", percentage: 50 }],
        registry: { date: "1997-05-01" },
      })),
      parseArticlesDocument(actDocument("amendment", {
        documentType: "CORPORATE_AMENDMENT",
        actKind: "AMENDMENT",
        legalName: "MODIEBO",
        applicantShareholderName: "EDGARDO GONZALEZ HIGUERA",
        applicantSharePercentage: 51,
        shareholders: [{ name: "EDGARDO GONZALEZ HIGUERA", percentage: 51 }],
        registry: { date: "2011-07-15" },
      })),
    ].filter((doc) => doc != null);

    const vigent = resolveVigentArticles(docs);

    expect(vigent.documentId).toBe("amendment");
    expect(vigent.applicantSharePercentage).toBe(51);
    expect(vigent.applicantShareEntryDate).toBe("1997-04-28");
    expect(vigent.applicantShareEntrySource).toBe("CONSTITUTIVE");
    expect(vigent.displacedByUnregisteredAmendment).toBe(false);
  });

  it("uses the admission assembly when the constitutive table omits the applicant", () => {
    const docs = [
      parseArticlesDocument(actDocument("constitutive", {
        documentType: "ARTICLES_OF_INCORPORATION",
        actKind: "CONSTITUTIVE",
        incorporationDate: "1997-04-28",
        shareholders: [{ name: "OTRO SOCIO", percentage: 100 }],
        registry: { date: "1997-05-01" },
      })),
      parseArticlesDocument(actDocument("admission", {
        documentType: "CORPORATE_AMENDMENT",
        actKind: "AMENDMENT",
        assemblyDate: "2018-03-01",
        applicantShareholderName: "EDGARDO GONZALEZ HIGUERA",
        applicantSharePercentage: 20,
        shareholders: [{ name: "EDGARDO GONZALEZ HIGUERA", percentage: 20 }],
        registry: { date: "2018-04-01" },
      })),
    ].filter((doc) => doc != null);

    expect(resolveVigentArticles(docs).applicantShareEntryDate).toBe("2018-03-01");
    expect(resolveVigentArticles(docs).applicantShareEntrySource).toBe("ADMISSION");
  });
});
