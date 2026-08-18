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
      errors: result.errors ?? {
        _form: "Credenciales inválidas o correo no verificado",
      },
    };
  } catch (error) {
    if ((error as Error)?.message === "NEXT_REDIRECT") {
      throw error;
    }
    return { errors: { _form: "Error al iniciar sesión" } };
  }
}

export async function register(
  prevState: ActionState & { successMessage?: string },
  formData: FormData,
): Promise<ActionState & { successMessage?: string }> {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return { errors: { name: "El nombre es obligatorio" } };
  }

  if (!email || typeof email !== "string" || email.trim().length === 0) {
    return { errors: { email: "El correo electrónico es obligatorio" } };
  }

  if (
    !password ||
    typeof password !== "string" ||
    password.trim().length < 6
  ) {
    return {
      errors: {
        password: "La contraseña debe tener al menos 6 caracteres",
      },
    };
  }

  if (password !== confirmPassword) {
    return {
      errors: { confirmPassword: "Las contraseñas no coinciden" },
    };
  }

  try {
    const result = await apiFetch<{ message: string }>("/auth/register", {
      method: "POST",
      body: { name: name.trim(), email: email.trim(), password },
    });

    if (result.ok) {
      return {
        successMessage: result.data.message,
      };
    }

    return {
      errors: result.errors ?? {
        _form: "Error al registrar la cuenta",
      },
    };
  } catch {
    return { errors: { _form: "Error de conexión al servidor" } };
  }
}

export async function verifyEmailAction(token: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const result = await apiFetch<{ message: string }>(
      `/auth/verify-email?token=${encodeURIComponent(token)}`,
      { method: "GET" },
    );

    if (result.ok) {
      return { success: true, message: result.data.message };
    }
    return {
      success: false,
      message: result.errors?._form ?? "Error al verificar el correo.",
    };
  } catch {
    return { success: false, message: "Error al comunicar con el servidor." };
  }
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
