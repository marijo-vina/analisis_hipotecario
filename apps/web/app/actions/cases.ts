"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import type { MortgageCase, ActionState } from "@/app/lib/definitions";

export async function createCase(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const clientId = formData.get("clientId");
  const creditTypeId = formData.get("creditTypeId");
  const personType = formData.get("personType");
  const propertyLocation = formData.get("propertyLocation");
  const requestedAmount = formData.get("requestedAmount");
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
    const n = Number(v);
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

  const amt = num(requestedAmount);
  if (amt !== undefined) body.requestedAmount = amt;

  const val = num(propertyValue);
  if (val !== undefined) body.propertyValue = val;

  const term = num(estimatedTermMonths);
  if (term !== undefined) body.estimatedTermMonths = term;

  const noteStr = str(notes);
  if (noteStr) body.notes = noteStr;

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
