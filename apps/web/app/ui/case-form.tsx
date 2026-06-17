"use client";

import { useActionState } from "react";
import { createCase } from "@/app/actions/cases";
import ErrorMessage from "@/app/ui/error-message";
import FormField from "@/app/ui/common/form-field";
import Button from "@/app/ui/common/button";
import Card from "@/app/ui/common/card";
import ClientSelector from "@/app/ui/client-selector";
import type { ActionState, Client, CreditType } from "@/app/lib/definitions";

const initialState: ActionState = { errors: {} };

/** Shared input styling matching the design tokens. */
const INPUT_CLASS =
  "block w-full h-[42px] rounded-[var(--radius-sm)] border border-gf-border px-3 py-2 text-sm text-gf-text " +
  "placeholder-gf-text-soft bg-white " +
  "focus:outline-none focus:border-gf-red focus:ring-1 focus:ring-gf-red " +
  "transition-colors duration-150";

const TEXTAREA_CLASS =
  "block w-full rounded-[var(--radius-sm)] border border-gf-border px-3 py-2 text-sm text-gf-text " +
  "placeholder-gf-text-soft bg-white " +
  "focus:outline-none focus:border-gf-red focus:ring-1 focus:ring-gf-red " +
  "transition-colors duration-150";

interface CaseFormProps {
  creditTypes: CreditType[];
  clients: Client[];
}

/**
 * New mortgage case form — client component.
 *
 * Uses `useActionState` with the existing `createCase` server action.
 * All fields use FormField for consistent styling and inline validation
 * errors. Labels are in Spanish with business meaning — never technical
 * codes. Client selector is preserved as-is.
 */
export default function CaseForm({ creditTypes, clients }: CaseFormProps) {
  const [state, formAction, pending] = useActionState(
    createCase,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      {/* General form error */}
      <ErrorMessage message={state?.errors?._form} />

      <Card>
        <h3 className="text-base font-semibold text-gf-text mb-4">
          Datos del expediente
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
          {/* Cliente — searchable selector, full width */}
          <div className="lg:col-span-2 flex flex-col gap-1.5">
            <label
              htmlFor="clientId"
              className="text-gf-text font-medium text-sm"
            >
              Cliente
              <span className="text-gf-red ml-0.5" aria-hidden="true">
                *
              </span>
            </label>
            <ClientSelector clients={clients} />
            {state?.errors?.clientId && (
              <p className="text-red-600 text-sm" role="alert">
                {state.errors.clientId}
              </p>
            )}
          </div>

          {/* Tipo de crédito */}
          <FormField
            label="Tipo de crédito"
            name="creditTypeId"
            required
            error={state?.errors?.creditTypeId}
          >
            <select
              id="creditTypeId"
              name="creditTypeId"
              required
              defaultValue=""
              className={INPUT_CLASS}
            >
              <option value="" disabled>
                Seleccionar...
              </option>
              {creditTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.name}
                </option>
              ))}
            </select>
          </FormField>

          {/* Tipo de persona — disabled, MVP only supports SALARIED */}
          <FormField label="Tipo de persona" name="personType">
            <select
              id="personType"
              disabled
              defaultValue="SALARIED"
              className={`${INPUT_CLASS} bg-gf-bg/50 disabled:cursor-not-allowed`}
              aria-readonly="true"
            >
              <option value="SALARIED">Asalariado</option>
            </select>
            <input type="hidden" name="personType" value="SALARIED" />
          </FormField>

          {/* Ubicación de la propiedad */}
          <FormField
            label="Ubicación de la propiedad"
            name="propertyLocation"
            error={state?.errors?.propertyLocation}
          >
            <input
              id="propertyLocation"
              name="propertyLocation"
              type="text"
              className={INPUT_CLASS}
              placeholder="Ej. Av. Reforma 222, CDMX"
            />
          </FormField>

          {/* Monto solicitado */}
          <FormField
            label="Monto solicitado"
            name="requestedAmount"
            error={state?.errors?.requestedAmount}
          >
            <input
              id="requestedAmount"
              name="requestedAmount"
              type="number"
              min="0"
              step="0.01"
              className={INPUT_CLASS}
              placeholder="1500000"
            />
          </FormField>

          {/* Valor de la propiedad */}
          <FormField
            label="Valor de la propiedad"
            name="propertyValue"
            error={state?.errors?.propertyValue}
          >
            <input
              id="propertyValue"
              name="propertyValue"
              type="number"
              min="0"
              step="0.01"
              className={INPUT_CLASS}
              placeholder="2000000"
            />
          </FormField>

          {/* Plazo estimado (meses) */}
          <FormField
            label="Plazo estimado (meses)"
            name="estimatedTermMonths"
            error={state?.errors?.estimatedTermMonths}
          >
            <input
              id="estimatedTermMonths"
              name="estimatedTermMonths"
              type="number"
              min="1"
              step="1"
              className={INPUT_CLASS}
              placeholder="240"
            />
          </FormField>
        </div>

        {/* Observaciones — full width */}
        <div className="mt-4">
          <FormField
            label="Observaciones"
            name="notes"
            error={state?.errors?.notes}
          >
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className={TEXTAREA_CLASS}
              placeholder="Información adicional del expediente"
            />
          </FormField>
        </div>
      </Card>

      {/* Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="primary" type="submit" loading={pending}>
          {pending ? "Guardando..." : "Guardar expediente"}
        </Button>
        <Button variant="secondary" href="/dashboard/expedientes">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
