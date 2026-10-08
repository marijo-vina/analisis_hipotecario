"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import type { MortgageCase, ActionState } from "@/app/lib/definitions";

function optionalTrimmed(value: FormDataEntryValue | null): string | undefined {
  return value && typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  if (!value || typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? undefined : n;
}

function parseCorporateFields(formData: FormData): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  const sharePercentage = optionalNumber(formData.get("sharePercentage"));
  if (sharePercentage !== undefined) fields.sharePercentage = sharePercentage;

  const incorporationDate = optionalTrimmed(formData.get("incorporationDate"));
  if (incorporationDate) fields.incorporationDate = incorporationDate;

  const shareTenureMonths = optionalNumber(formData.get("shareTenureMonths"));
  if (shareTenureMonths !== undefined) fields.shareTenureMonths = shareTenureMonths;

  const legalName = optionalTrimmed(formData.get("legalName"));
  if (legalName) fields.legalName = legalName;

  const companyRfc = optionalTrimmed(formData.get("companyRfc"));
  if (companyRfc) fields.companyRfc = companyRfc.toUpperCase();

  return fields;
}

export async function createCase(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const clientId = formData.get("clientId");
  const creditTypeId = formData.get("creditTypeId");
  const personType = formData.get("personType");
  const propertyLocation = formData.get("propertyLocation");
  const propertyValue = formData.get("propertyValue");
  const estimatedTermMonths = formData.get("estimatedTermMonths");
  const notes = formData.get("notes");

  // ---- Validate required fields -------------------------------------------
  const errors: Record<string, string> = {};

  if (
    !clientId ||
    typeof clientId !== "string" ||
    clientId.trim().length === 0
  ) {
    errors.clientId = "Debe seleccionar un cliente";
  }

  if (
    !creditTypeId ||
    typeof creditTypeId !== "string" ||
    creditTypeId.trim().length === 0
  ) {
    errors.creditTypeId = "El tipo de crédito es obligatorio";
  } else {
    const parsed = Number(creditTypeId);
    if (Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      errors.creditTypeId = "El tipo de crédito no es válido";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  // ---- Build body (only include non-empty optional fields) ----------------
  const str = (v: FormDataEntryValue | null) =>
    v && typeof v === "string" && v.trim() ? v.trim() : undefined;

  const num = (v: FormDataEntryValue | null) => {
    if (!v || typeof v !== "string" || v.trim() === "") return undefined;
    const clean = v.replace(/[^0-9.]/g, "");
    const n = Number(clean);
    return Number.isNaN(n) ? undefined : n;
  };

  const body: Record<string, unknown> = {
    clientId: (clientId as string).trim(),
    creditTypeId: Number(creditTypeId),
  };

  const person = str(personType);
  if (person) body.personType = person;

  const loc = str(propertyLocation);
  if (loc) body.propertyLocation = loc;

  const val = num(propertyValue);
  if (val !== undefined) body.propertyValue = val;

  const term = num(estimatedTermMonths);
  if (term !== undefined) body.estimatedTermMonths = term;

  const noteStr = str(notes);
  if (noteStr) body.notes = noteStr;

  Object.assign(body, parseCorporateFields(formData));

  // ---- Call backend -------------------------------------------------------
  const result = await apiFetch<MortgageCase>("/mortgage-cases", {
    method: "POST",
    body,
  });

  if (result.ok) {
    redirect("/dashboard/expedientes");
  }

  return {
    errors: result.errors ?? { _form: "Error al crear el expediente" },
  };
}

export async function updateCase(
  caseId: string,
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const creditTypeId = formData.get("creditTypeId");
  const propertyLocation = formData.get("propertyLocation");
  const propertyValue = formData.get("propertyValue");
  const estimatedTermMonths = formData.get("estimatedTermMonths");
  const notes = formData.get("notes");

  // ---- Validate required fields -------------------------------------------
  const errors: Record<string, string> = {};

  if (
    !creditTypeId ||
    typeof creditTypeId !== "string" ||
    creditTypeId.trim().length === 0
  ) {
    errors.creditTypeId = "El tipo de crédito es obligatorio";
  } else {
    const parsed = Number(creditTypeId);
    if (Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      errors.creditTypeId = "El tipo de crédito no es válido";
    }
  }

  // ---- Validate optional numeric fields (positive only) -------------------
  const str = (v: FormDataEntryValue | null) =>
    v && typeof v === "string" && v.trim() ? v.trim() : undefined;

  const num = (v: FormDataEntryValue | null) => {
    if (!v || typeof v !== "string" || v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  };

  const val = num(propertyValue);
  if (val !== undefined && val <= 0) {
    errors.propertyValue = "El valor de la propiedad debe ser positivo";
  }

  const term = num(estimatedTermMonths);
  if (term !== undefined && term <= 0) {
    errors.estimatedTermMonths = "El plazo estimado debe ser mayor a 0";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  // ---- Build body (only include non-empty optional fields) ----------------
  const body: Record<string, unknown> = {
    creditTypeId: Number(creditTypeId),
  };

  const loc = str(propertyLocation);
  if (loc) body.propertyLocation = loc;

  if (val !== undefined) body.propertyValue = val;

  if (term !== undefined) body.estimatedTermMonths = term;

  const noteStr = str(notes);
  if (noteStr) body.notes = noteStr;

  Object.assign(body, parseCorporateFields(formData));

  // ---- Call backend -------------------------------------------------------
  const result = await apiFetch<MortgageCase>(`/mortgage-cases/${caseId}`, {
    method: "PUT",
    body,
  });

  if (result.ok) {
    redirect(`/dashboard/expedientes/${caseId}`);
  }

  return {
    errors: result.errors ?? { _form: "Error al actualizar el expediente" },
  };
}
