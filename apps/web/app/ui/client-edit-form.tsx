"use client";

import { useActionState } from "react";
import { updateClient } from "@/app/actions/clients";
import ErrorMessage from "@/app/ui/error-message";
import FormField from "@/app/ui/common/form-field";
import Button from "@/app/ui/common/button";
import Card from "@/app/ui/common/card";
import type { Client, ActionState } from "@/app/lib/definitions";

const initialState: ActionState = { errors: {} };

/** Shared input styling matching the design tokens. */
const INPUT_CLASS =
  "block w-full h-[42px] rounded-[var(--radius-sm)] border border-gf-border px-3 py-2 text-sm text-gf-text " +
  "placeholder-gf-text-soft bg-white " +
  "focus:outline-none focus:border-gf-red focus:ring-1 focus:ring-gf-red " +
  "transition-colors duration-150";

interface ClientEditFormProps {
  client: Client;
}

export default function ClientEditForm({ client }: ClientEditFormProps) {
  const boundAction = updateClient.bind(null, client.id);
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      {/* General form error */}
      <ErrorMessage message={state?.errors?._form} />

      {/* ── Secci\u00f3n: Datos personales ──────────────────────────────── */}
      <Card>
        <h3 className="text-base font-semibold text-gf-text mb-4">
          Datos personales
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
              defaultValue={client.firstName}
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
              defaultValue={client.paternalLastName}
              className={INPUT_CLASS}
              placeholder="Ej. Garc\u00eda"
            />
          </FormField>

          {/* Apellido materno */}
          <FormField label="Apellido materno" name="maternalLastName">
            <input
              id="maternalLastName"
              name="maternalLastName"
              type="text"
              defaultValue={client.maternalLastName ?? ""}
              className={INPUT_CLASS}
              placeholder="Ej. L\u00f3pez"
            />
          </FormField>

          {/* Correo electr\u00f3nico */}
          <FormField
            label="Correo electr\u00f3nico"
            name="email"
            required
            error={state?.errors?.email}
          >
            <input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={client.email}
              className={INPUT_CLASS}
              placeholder="correo@ejemplo.com"
            />
          </FormField>

          {/* Tel\u00e9fono */}
          <FormField
            label="Tel\u00e9fono"
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
              defaultValue={client.phone}
              className={INPUT_CLASS}
              placeholder="5512345678"
            />
            <p className="text-gf-text-soft text-xs mt-1">10 d\u00edgitos</p>
          </FormField>
        </div>
      </Card>

      {/* ── Secci\u00f3n: Identificaci\u00f3n oficial ────────────────────── */}
      <Card>
        <h3 className="text-base font-semibold text-gf-text mb-4">
          Identificaci\u00f3n oficial
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* RFC */}
          <FormField label="RFC" name="rfc" error={state?.errors?.rfc}>
            <input
              id="rfc"
              name="rfc"
              type="text"
              minLength={12}
              maxLength={13}
              defaultValue={client.rfc ?? ""}
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
              defaultValue={client.curp ?? ""}
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
          {pending ? "Guardando..." : "Actualizar cliente"}
        </Button>
        <Button variant="secondary" href={`/dashboard/clientes/${client.id}`}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
