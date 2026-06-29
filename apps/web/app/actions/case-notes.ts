"use server";

import { apiFetch } from "@/app/lib/api";
import { revalidatePath } from "next/cache";

/**
 * Actualiza únicamente el campo `notes` de un expediente.
 * El backend ya soporta `notes` en el DTO de PATCH.
 */
export async function updateCaseNotes(
  caseId: string,
  notes: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await apiFetch(`/mortgage-cases/${caseId}`, {
    method: "PATCH",
    body: { notes },
  });

  if (result.ok) {
    revalidatePath(`/dashboard/expedientes/${caseId}`);
    return { success: true };
  }

  return {
    success: false,
    error: result.errors?._form ?? "No se pudo guardar la nota",
  };
}
