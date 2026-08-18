"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import type { ActionState } from "@/app/lib/definitions";
import FormField from "@/app/ui/common/form-field";
import Button from "@/app/ui/common/button";
import { Mail, Lock, AlertCircle } from "lucide-react";
import Link from "next/link";

const initialState: ActionState = { errors: {} };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {/* General form error banner */}
      {state?.errors?._form && (
        <div 
          className="rounded-[10px] bg-red-50 border border-red-200 p-3 text-xs font-medium text-red-700 flex items-center gap-2" 
          role="alert"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" strokeWidth={2} />
          <span>{state.errors._form}</span>
        </div>
      )}

      {/* Email field */}
      <FormField
        label="Correo electrónico"
        name="email"
        error={state?.errors?.email}
        required
      >
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gf-text-muted">
            <Mail className="w-4 h-4" strokeWidth={2} />
          </span>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={100}
            autoComplete="email"
            className="block w-full h-[44px] pl-10 pr-3 rounded-[10px] border border-gf-border bg-white text-sm text-gf-text placeholder-gf-text-muted focus:border-gf-red focus:outline-none focus:ring-2 focus:ring-gf-red/20 transition-all"
            placeholder="hipotecario@gestionfinanciera.com"
          />
        </div>
      </FormField>

      {/* Password field */}
      <FormField
        label="Contraseña"
        name="password"
        error={state?.errors?.password}
        required
      >
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gf-text-muted">
            <Lock className="w-4 h-4" strokeWidth={2} />
          </span>
          <input
            id="password"
            name="password"
            type="password"
            required
            maxLength={64}
            autoComplete="current-password"
            className="block w-full h-[44px] pl-10 pr-3 rounded-[10px] border border-gf-border bg-white text-sm text-gf-text placeholder-gf-text-muted focus:border-gf-red focus:outline-none focus:ring-2 focus:ring-gf-red/20 transition-all"
            placeholder="••••••••"
          />
        </div>
      </FormField>



      {/* Submit button */}
      <div className="pt-2">
        <Button
          variant="primary"
          type="submit"
          loading={pending}
          disabled={pending}
        >
          Iniciar sesión
        </Button>
      </div>

      <div className="text-center pt-2">
        <p className="text-xs text-gf-text-muted">
          ¿No tienes una cuenta?{" "}
          <Link
            href="/register"
            className="text-gf-red font-semibold hover:underline"
          >
            Regístrate aquí
          </Link>
        </p>
      </div>
    </form>
  );
}
