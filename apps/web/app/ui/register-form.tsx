"use client";

import { useActionState } from "react";
import { register } from "@/app/actions/auth";
import type { ActionState } from "@/app/lib/definitions";
import FormField from "@/app/ui/common/form-field";
import Button from "@/app/ui/common/button";
import { User, Mail, Lock, AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";

interface ExtendedState extends ActionState {
  successMessage?: string;
}

const initialState: ExtendedState = { errors: {} };

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, initialState);

  if (state?.successMessage) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
          <CheckCircle2 className="h-8 w-8" strokeWidth={2} />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-gf-text">
            ¡Registro casi completo!
          </h3>
          <p className="text-sm text-gf-text-muted leading-relaxed">
            {state.successMessage}
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center h-[44px] px-4 rounded-[10px] bg-gf-red text-white text-sm font-semibold hover:bg-gf-red/90 transition-colors"
          >
            Ir a Iniciar Sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* General error banner */}
      {state?.errors?._form && (
        <div
          className="rounded-[10px] bg-red-50 border border-red-200 p-3 text-xs font-medium text-red-700 flex items-center gap-2"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" strokeWidth={2} />
          <span>{state.errors._form}</span>
        </div>
      )}

      {/* Full Name field */}
      <FormField
        label="Nombre completo"
        name="name"
        error={state?.errors?.name}
        required
      >
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gf-text-muted">
            <User className="w-4 h-4" strokeWidth={2} />
          </span>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={100}
            className="block w-full h-[44px] pl-10 pr-3 rounded-[10px] border border-gf-border bg-white text-sm text-gf-text placeholder-gf-text-muted focus:border-gf-red focus:outline-none focus:ring-2 focus:ring-gf-red/20 transition-all"
            placeholder="Juan Pérez García"
          />
        </div>
      </FormField>

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
            autoComplete="new-password"
            className="block w-full h-[44px] pl-10 pr-3 rounded-[10px] border border-gf-border bg-white text-sm text-gf-text placeholder-gf-text-muted focus:border-gf-red focus:outline-none focus:ring-2 focus:ring-gf-red/20 transition-all"
            placeholder="••••••••"
          />
        </div>
      </FormField>

      {/* Confirm Password field */}
      <FormField
        label="Confirmar contraseña"
        name="confirmPassword"
        error={state?.errors?.confirmPassword}
        required
      >
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gf-text-muted">
            <Lock className="w-4 h-4" strokeWidth={2} />
          </span>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            maxLength={64}
            autoComplete="new-password"
            className="block w-full h-[44px] pl-10 pr-3 rounded-[10px] border border-gf-border bg-white text-sm text-gf-text placeholder-gf-text-muted focus:border-gf-red focus:outline-none focus:ring-2 focus:ring-gf-red/20 transition-all"
            placeholder="••••••••"
          />
        </div>
      </FormField>

      {/* Submit button */}
      <div className="pt-3">
        <Button
          variant="primary"
          type="submit"
          loading={pending}
          disabled={pending}
        >
          Crear cuenta
        </Button>
      </div>

      <div className="text-center pt-2">
        <p className="text-xs text-gf-text-muted">
          ¿Ya tienes una cuenta?{" "}
          <Link
            href="/login"
            className="text-gf-red font-semibold hover:underline"
          >
            Inicia sesión
          </Link>
        </p>
      </div>
    </form>
  );
}
