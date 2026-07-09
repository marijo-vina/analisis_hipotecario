"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiFetch } from "@/app/lib/api";
import type { Client, ActionState } from "@/app/lib/definitions";

// ---------------------------------------------------------------------------
// Shared validation helper — used by both createClient and updateClient
// ---------------------------------------------------------------------------

function validateClientFields(formData: FormData): Record<string, string> {
  const errors: Record<string, string> = {};

  const firstName = (formData.get("firstName") as string)?.trim();
  const paternalLastName = (formData.get("paternalLastName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const rfc = (formData.get("rfc") as string)?.trim().toUpperCase();
  const curp = (formData.get("curp") as string)?.trim().toUpperCase();

  if (!firstName) errors.firstName = "El nombre es obligatorio";

  if (!paternalLastName)
    errors.paternalLastName = "El apellido paterno es obligatorio";

  if (!email) errors.email = "El correo electrónico es obligatorio";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "El correo electrónico no es válido";

  if (!phone) errors.phone = "El teléfono es obligatorio";
  else if (!/^\d{10}$/.test(phone))
    errors.phone = "El teléfono debe tener 10 dígitos";

  if (
    rfc &&
    !/^[A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/.test(rfc)
  )
    errors.rfc =
      "El RFC ingresado no tiene un formato válido. Verifica que tenga 12 o 13 caracteres y que esté escrito correctamente.";

  if (
    curp &&
    !/^[A-Z]{4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$/.test(curp)
  )
    errors.curp =
      "La CURP ingresada no tiene un formato válido. Verifica que tenga 18 caracteres y que esté escrita correctamente.";

  return errors;
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

export async function createClient(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // ---- Validate ------------------------------------------------------------
  const errors = validateClientFields(formData);
  if (Object.keys(errors).length > 0) return { errors };

  // ---- Extract trimmed values ----------------------------------------------
  const firstName = (formData.get("firstName") as string).trim();
  const paternalLastName = (formData.get("paternalLastName") as string).trim();
  const maternalLastName = (formData.get("maternalLastName") as string)?.trim();
  const rfc = (formData.get("rfc") as string)?.trim().toUpperCase();
  const curp = (formData.get("curp") as string)?.trim().toUpperCase();
  const email = (formData.get("email") as string).trim();
  const phone = (formData.get("phone") as string).trim();

  // ---- Call backend -------------------------------------------------------
  const result = await apiFetch<Client>("/clients", {
    method: "POST",
    body: {
      firstName,
      paternalLastName,
      maternalLastName: maternalLastName || undefined,
      rfc: rfc || undefined,
      curp: curp || undefined,
      email,
      phone,
    },
  });

  if (result.ok) {
    revalidatePath("/dashboard/expedientes/nuevo");
    redirect("/dashboard/clientes");
  }

  return {
    errors: result.errors ?? { _form: "Error al crear el cliente" },
  };
}

export async function updateClient(
  clientId: string,
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // ---- Validate ------------------------------------------------------------
  const errors = validateClientFields(formData);
  if (Object.keys(errors).length > 0) return { errors };

  // ---- Extract trimmed values ----------------------------------------------
  const firstName = (formData.get("firstName") as string).trim();
  const paternalLastName = (formData.get("paternalLastName") as string).trim();
  const maternalLastName = (formData.get("maternalLastName") as string)?.trim();
  const rfc = (formData.get("rfc") as string)?.trim().toUpperCase();
  const curp = (formData.get("curp") as string)?.trim().toUpperCase();
  const email = (formData.get("email") as string).trim();
  const phone = (formData.get("phone") as string).trim();

  // ---- Call backend -------------------------------------------------------
  const result = await apiFetch<Client>(`/clients/${clientId}`, {
    method: "PATCH",
    body: {
      firstName,
      paternalLastName,
      maternalLastName: maternalLastName || undefined,
      rfc: rfc || undefined,
      curp: curp || undefined,
      email,
      phone,
    },
  });

  if (result.ok) {
    revalidatePath("/dashboard/expedientes/nuevo");
    redirect(`/dashboard/clientes/${clientId}`);
  }

  return {
    errors: result.errors ?? { _form: "Error al actualizar el cliente" },
  };
}
