"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import type { ActionState } from "@/app/lib/definitions";
import FormField from "@/app/ui/common/form-field";
import Button from "@/app/ui/common/button";

const initialState: ActionState = { errors: {} };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {/* General form error banner */}
      {state?.errors?._form && (
        <div className="rounded-[var(--radius-sm)] bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
          {state.errors._form}
        </div>
      )}

      {/* Email field */}
      <FormField
        label="Correo electrónico"
        name="email"
        error={state?.errors?.email}
        required
      >
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="block w-full h-[var(--input-height)] rounded-[var(--radius-sm)] border border-gf-border px-3 py-2 text-sm text-gf-text shadow-sm placeholder-gray-400 focus:border-gf-red focus:outline-none focus:ring-1 focus:ring-gf-red"
          placeholder="correo@ejemplo.com"
        />
      </FormField>

      {/* Password field */}
      <FormField
        label="Contraseña"
        name="password"
        error={state?.errors?.password}
        required
      >
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="block w-full h-[var(--input-height)] rounded-[var(--radius-sm)] border border-gf-border px-3 py-2 text-sm text-gf-text shadow-sm placeholder-gray-400 focus:border-gf-red focus:outline-none focus:ring-1 focus:ring-gf-red"
          placeholder="••••••••"
        />
      </FormField>

      {/* Submit button */}
      <Button
        variant="primary"
        type="submit"
        loading={pending}
        disabled={pending}
      >
        Iniciar sesión
      </Button>
    </form>
  );
}
