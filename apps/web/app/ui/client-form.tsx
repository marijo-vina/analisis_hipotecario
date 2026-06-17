"use client";

import { useActionState } from "react";
import { createClient } from "@/app/actions/clients";
import ErrorMessage from "@/app/ui/error-message";
import FormField from "@/app/ui/common/form-field";
import Button from "@/app/ui/common/button";
import Card from "@/app/ui/common/card";
import type { ActionState } from "@/app/lib/definitions";

const initialState: ActionState = { errors: {} };

/** Shared input styling matching the design tokens. */
const INPUT_CLASS =
  "block w-full h-[42px] rounded-[var(--radius-sm)] border border-gf-border px-3 py-2 text-sm text-gf-text " +
  "placeholder-gf-text-soft bg-white " +
  "focus:outline-none focus:border-gf-red focus:ring-1 focus:ring-gf-red " +
  "transition-colors duration-150";

export default function ClientForm() {
  const [state, formAction, pending] = useActionState(
    createClient,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      {/* General form error */}
      <ErrorMessage message={state?.errors?._form} />

      {/* ── Sección: Datos personales ──────────────────────────────── */}
      <Card>
        <h3 className="text-base font-semibold text-gf-text mb-4">
          Datos personales
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
          {/* Nombre */}
          <FormField
            label="Nombre"
            name="firstName"
            required
            error={state?.errors?.firstName}
          >
            <input
              id="firstName"
              name="firstName"
              type="text"
              required
              className={INPUT_CLASS}
              placeholder="Ej. Juan"
            />
          </FormField>

          {/* Apellido paterno */}
          <FormField
            label="Apellido paterno"
            name="paternalLastName"
            required
            error={state?.errors?.paternalLastName}
          >
            <input
              id="paternalLastName"
              name="paternalLastName"
              type="text"
              required
              className={INPUT_CLASS}
              placeholder="Ej. García"
            />
          </FormField>

          {/* Apellido materno */}
          <FormField label="Apellido materno" name="maternalLastName">
            <input
              id="maternalLastName"
              name="maternalLastName"
              type="text"
              className={INPUT_CLASS}
              placeholder="Ej. López"
            />
          </FormField>

          {/* Correo electrónico */}
          <FormField
            label="Correo electrónico"
            name="email"
            required
            error={state?.errors?.email}
          >
            <input
              id="email"
              name="email"
              type="email"
              required
              className={INPUT_CLASS}
              placeholder="correo@ejemplo.com"
            />
          </FormField>

          {/* Teléfono */}
          <FormField
            label="Teléfono"
            name="phone"
            required
            error={state?.errors?.phone}
          >
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              pattern="[0-9]{10}"
              className={INPUT_CLASS}
              placeholder="5512345678"
            />
            <p className="text-gf-text-soft text-xs mt-1">10 dígitos</p>
          </FormField>
        </div>
      </Card>

      {/* ── Sección: Identificación oficial ────────────────────── */}
      <Card>
        <h3 className="text-base font-semibold text-gf-text mb-4">
          Identificación oficial
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
          {/* RFC */}
          <FormField label="RFC" name="rfc" error={state?.errors?.rfc}>
            <input
              id="rfc"
              name="rfc"
              type="text"
              minLength={12}
              maxLength={13}
              className={INPUT_CLASS}
              placeholder="XXXX000000XXX"
            />
            <p className="text-gf-text-soft text-xs mt-1">12-13 caracteres</p>
          </FormField>

          {/* CURP */}
          <FormField label="CURP" name="curp" error={state?.errors?.curp}>
            <input
              id="curp"
              name="curp"
              type="text"
              minLength={18}
              maxLength={18}
              className={INPUT_CLASS}
              placeholder="XXXX000000XXXXXX00"
            />
            <p className="text-gf-text-soft text-xs mt-1">18 caracteres</p>
          </FormField>
        </div>
      </Card>

      {/* ── Botones ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="primary" type="submit" loading={pending}>
          {pending ? "Guardando..." : "Guardar cliente"}
        </Button>
        <Button variant="secondary" href="/dashboard/clientes">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
