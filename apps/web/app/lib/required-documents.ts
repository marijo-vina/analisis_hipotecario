export type DocumentOwner = "SHAREHOLDER" | "COMPANY";

export interface RequiredDocCheck {
  key: string;
  label: string;
  codes: string[];
  owner?: DocumentOwner;
  group?: DocumentOwner;
}

export interface DocumentCategory {
  key: string;
  label: string;
  codes: string[];
  owner?: DocumentOwner;
}

export interface DocLike {
  documentType: { code: string };
  documentStatus: { code: string };
  owner?: string | null;
}

const IDENTITY_CHECK: RequiredDocCheck = {
  key: "identity",
  label: "Identificación oficial (INE/Pasaporte)",
  codes: ["INE", "PASSPORT"],
};

const BANK_STATEMENT_CHECK: RequiredDocCheck = {
  key: "bank-statement",
  label: "Estado de cuenta bancario",
  codes: ["BANK_STATEMENT"],
};

const CREDIT_BUREAU_CHECK: RequiredDocCheck = {
  key: "credit-bureau",
  label: "Buró de crédito / Score",
  codes: ["CREDIT_BUREAU_REPORT", "CREDIT_SCORE"],
};

const SALARIED_CHECKS: RequiredDocCheck[] = [
  IDENTITY_CHECK,
  { key: "payroll", label: "Recibo de nómina", codes: ["PAYROLL_RECEIPT"] },
  BANK_STATEMENT_CHECK,
  CREDIT_BUREAU_CHECK,
];

const PFAE_CHECKS: RequiredDocCheck[] = [
  IDENTITY_CHECK,
  { key: "csf", label: "Constancia de Situación Fiscal (CSF)", codes: ["CSF"] },
  { key: "tax-return", label: "Declaración anual", codes: ["TAX_RETURN"] },
  BANK_STATEMENT_CHECK,
  CREDIT_BUREAU_CHECK,
];

function ownedCheck(
  key: string,
  label: string,
  codes: string[],
  owner: DocumentOwner,
): RequiredDocCheck {
  return { key, label, codes, owner, group: owner };
}

const PM_CHECKS: RequiredDocCheck[] = [
  ownedCheck(
    "shareholder-identity",
    "Identificación oficial (INE/Pasaporte)",
    ["INE", "PASSPORT"],
    "SHAREHOLDER",
  ),
  ownedCheck(
    "shareholder-credit-bureau",
    "Buró de crédito",
    ["CREDIT_BUREAU_REPORT"],
    "SHAREHOLDER",
  ),
  ownedCheck(
    "shareholder-csf",
    "Constancia de Situación Fiscal (CSF)",
    ["CSF"],
    "SHAREHOLDER",
  ),
  ownedCheck(
    "shareholder-bank-statement",
    "Estado de cuenta bancario",
    ["BANK_STATEMENT"],
    "SHAREHOLDER",
  ),
  ownedCheck(
    "shareholder-tax-return",
    "Declaración anual",
    ["TAX_RETURN"],
    "SHAREHOLDER",
  ),
  ownedCheck(
    "company-credit-bureau",
    "Buró de crédito",
    ["CREDIT_BUREAU_REPORT"],
    "COMPANY",
  ),
  ownedCheck(
    "company-csf",
    "Constancia de Situación Fiscal (CSF)",
    ["CSF"],
    "COMPANY",
  ),
  ownedCheck(
    "company-bank-statement",
    "Estado de cuenta bancario",
    ["BANK_STATEMENT"],
    "COMPANY",
  ),
  ownedCheck(
    "company-tax-return",
    "Declaración anual",
    ["TAX_RETURN"],
    "COMPANY",
  ),
  ownedCheck(
    "company-articles",
    "Acta constitutiva",
    ["ARTICLES_OF_INCORPORATION"],
    "COMPANY",
  ),
];

const SALARIED_CATEGORIES: DocumentCategory[] = [
  { key: "identificacion", label: "Identificación", codes: ["INE", "PASSPORT"] },
  { key: "nomina", label: "Nómina", codes: ["PAYROLL_RECEIPT"] },
  { key: "estados-cuenta", label: "Estados de cuenta", codes: ["BANK_STATEMENT"] },
  { key: "buro", label: "Buró", codes: ["CREDIT_BUREAU_REPORT", "CREDIT_SCORE"] },
];

const PFAE_CATEGORIES: DocumentCategory[] = [
  { key: "identificacion", label: "Identificación", codes: ["INE", "PASSPORT"] },
  { key: "csf", label: "CSF", codes: ["CSF"] },
  { key: "declaracion", label: "Declaración anual", codes: ["TAX_RETURN"] },
  { key: "estados-cuenta", label: "Estados de cuenta", codes: ["BANK_STATEMENT"] },
  { key: "buro", label: "Buró", codes: ["CREDIT_BUREAU_REPORT", "CREDIT_SCORE"] },
];

function ownedCategory(
  key: string,
  label: string,
  codes: string[],
  owner: DocumentOwner,
): DocumentCategory {
  return { key, label, codes, owner };
}

const PM_CATEGORIES: DocumentCategory[] = [
  ownedCategory(
    "shareholder-identificacion",
    "Identificación",
    ["INE", "PASSPORT"],
    "SHAREHOLDER",
  ),
  ownedCategory(
    "shareholder-buro",
    "Buró",
    ["CREDIT_BUREAU_REPORT"],
    "SHAREHOLDER",
  ),
  ownedCategory("shareholder-csf", "CSF", ["CSF"], "SHAREHOLDER"),
  ownedCategory(
    "shareholder-estados-cuenta",
    "Estados de cuenta",
    ["BANK_STATEMENT"],
    "SHAREHOLDER",
  ),
  ownedCategory(
    "shareholder-declaracion",
    "Declaración anual",
    ["TAX_RETURN"],
    "SHAREHOLDER",
  ),
  ownedCategory("company-buro", "Buró", ["CREDIT_BUREAU_REPORT"], "COMPANY"),
  ownedCategory("company-csf", "CSF", ["CSF"], "COMPANY"),
  ownedCategory(
    "company-estados-cuenta",
    "Estados de cuenta",
    ["BANK_STATEMENT"],
    "COMPANY",
  ),
  ownedCategory(
    "company-declaracion",
    "Declaración anual",
    ["TAX_RETURN"],
    "COMPANY",
  ),
  ownedCategory(
    "company-acta",
    "Acta constitutiva",
    ["ARTICLES_OF_INCORPORATION"],
    "COMPANY",
  ),
  ownedCategory(
    "company-amendment",
    "Modificación de poderes",
    ["CORPORATE_AMENDMENT"],
    "COMPANY",
  ),
];

function resolveDocOwner(owner?: string | null): DocumentOwner {
  return owner === "COMPANY" ? "COMPANY" : "SHAREHOLDER";
}

export function getRequiredDocChecks(personType?: string): RequiredDocCheck[] {
  if (personType === "PM") return PM_CHECKS;
  if (personType === "PFAE") return PFAE_CHECKS;
  return SALARIED_CHECKS;
}

export function isRequiredDocReady(
  check: RequiredDocCheck,
  docs: DocLike[],
): boolean {
  return docs.some((d) => {
    if (!check.codes.includes(d.documentType.code)) return false;
    if (d.documentStatus.code !== "PROCESSED") return false;
    if (!check.owner) return true;
    return resolveDocOwner(d.owner) === check.owner;
  });
}

export function getDocumentCategories(personType?: string): DocumentCategory[] {
  if (personType === "PM") return PM_CATEGORIES;
  if (personType === "PFAE") return PFAE_CATEGORIES;
  return SALARIED_CATEGORIES;
}

export function filterUploadableDocumentTypes<T extends { code: string }>(
  types: T[],
  personType?: string,
): T[] {
  let filtered = types.filter((dt) => dt.code !== "PROOF_OF_ADDRESS");

  if (personType === "PM" || personType === "PFAE") {
    filtered = filtered.filter((dt) => dt.code !== "PAYROLL_RECEIPT");
  } else {
    filtered = filtered.filter(
      (dt) => dt.code !== "CSF" && dt.code !== "TAX_RETURN",
    );
  }

  if (personType !== "PM") {
    filtered = filtered.filter(
      (dt) =>
        dt.code !== "ARTICLES_OF_INCORPORATION" &&
        dt.code !== "CORPORATE_AMENDMENT",
    );
  }

  const hasPassport = filtered.some((dt) => dt.code === "PASSPORT");
  if (!hasPassport) {
    filtered = [...filtered, { code: "PASSPORT" } as T];
  }

  return filtered;
}

export function resolveUploadOwner(
  personType: string | undefined,
  code: string,
  selected: DocumentOwner = "SHAREHOLDER",
): DocumentOwner | undefined {
  if (personType !== "PM") return undefined;
  if (code === "ARTICLES_OF_INCORPORATION" || code === "CORPORATE_AMENDMENT") {
    return "COMPANY";
  }
  return selected;
}
