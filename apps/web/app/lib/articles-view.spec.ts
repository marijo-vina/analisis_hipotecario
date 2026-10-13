import { describe, expect, it } from "vitest";
import { parseArticlesDocument, resolveVigentArticles } from "./articles-view";
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

describe("resolveVigentArticles", () => {
  it("takes the applicant percentage from the later inscribed amendment", () => {
    const docs = [
      parseArticlesDocument(actDocument("constitutive", {
        documentType: "ARTICLES_OF_INCORPORATION",
        actKind: "CONSTITUTIVE",
        legalName: "MODIEBO",
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
    expect(vigent.displacedByUnregisteredAmendment).toBe(false);
  });
});
