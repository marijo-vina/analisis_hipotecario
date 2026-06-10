"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import type { Client, ActionState } from "@/app/lib/definitions";

export async function createClient(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const firstName = formData.get("firstName");
  const paternalLastName = formData.get("paternalLastName");
  const maternalLastName = formData.get("maternalLastName");
  const rfc = formData.get("rfc");
  const curp = formData.get("curp");
  const email = formData.get("email");
  const phone = formData.get("phone");

  // ---- Validate required fields -------------------------------------------
  const errors: Record<string, string> = {};

  if (
    !firstName ||
    typeof firstName !== "string" ||
    firstName.trim().length === 0
  ) {
    errors.firstName = "El nombre es obligatorio";
  }

  if (
    !paternalLastName ||
    typeof paternalLastName !== "string" ||
    paternalLastName.trim().length === 0
  ) {
    errors.paternalLastName = "El apellido paterno es obligatorio";
  }

  if (!email || typeof email !== "string" || email.trim().length === 0) {
    errors.email = "El email es obligatorio";
  }

  if (!phone || typeof phone !== "string" || phone.trim().length === 0) {
    errors.phone = "El teléfono es obligatorio";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  // ---- Call backend -------------------------------------------------------
  const result = await apiFetch<Client>("/clients", {
    method: "POST",
    body: {
      firstName: (firstName as string).trim(),
      paternalLastName: (paternalLastName as string).trim(),
      maternalLastName:
        maternalLastName &&
        typeof maternalLastName === "string" &&
        maternalLastName.trim()
          ? (maternalLastName as string).trim()
          : undefined,
      rfc:
        rfc && typeof rfc === "string" && rfc.trim()
          ? (rfc as string).trim()
          : undefined,
      curp:
        curp && typeof curp === "string" && curp.trim()
          ? (curp as string).trim()
          : undefined,
      email: (email as string).trim(),
      phone: (phone as string).trim(),
    },
  });

  if (result.ok) {
    redirect("/dashboard/clientes");
  }

  return {
    errors: result.errors ?? { _form: "Error al crear el cliente" },
  };
}
