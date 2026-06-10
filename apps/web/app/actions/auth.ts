"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import { createSession, deleteSession } from "@/app/lib/session";
import type { LoginResponse, ActionState } from "@/app/lib/definitions";

export async function login(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = formData.get("email");
  const password = formData.get("password");

  // Validate non-empty
  if (!email || typeof email !== "string" || email.trim().length === 0) {
    return { errors: { email: "El email es obligatorio" } };
  }

  if (
    !password ||
    typeof password !== "string" ||
    password.trim().length === 0
  ) {
    return { errors: { password: "La contraseña es obligatoria" } };
  }

  try {
    const result = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email: email.trim(), password },
    });

    if (result.ok) {
      await createSession(result.data.access_token);
      redirect("/dashboard");
    }

    return {
      errors: result.errors ?? { _form: "Credenciales inválidas" },
    };
  } catch {
    return { errors: { _form: "Error al iniciar sesión" } };
  }
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
