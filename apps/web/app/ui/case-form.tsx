"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createCase } from "@/app/actions/cases";
import ErrorMessage from "@/app/ui/error-message";
import ClientSelector from "@/app/ui/client-selector";
import type { ActionState, Client, CreditType } from "@/app/lib/definitions";

const initialState: ActionState = { errors: {} };

interface CaseFormProps {
  creditTypes: CreditType[];
  clients: Client[];
}

export default function CaseForm({ creditTypes, clients }: CaseFormProps) {
  const [state, formAction, pending] = useActionState(
    createCase,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {/* General form error */}
      <ErrorMessage message={state?.errors?._form} />

      {/* Client selector with search */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Cliente *
        </label>
        <ClientSelector clients={clients} />
        {state?.errors?.clientId && (
          <p className="mt-1 text-sm text-red-600">
            {state.errors.clientId}
          </p>
        )}
      </div>

      {/* Credit type */}
      <div>
        <label
          htmlFor="creditTypeId"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Tipo de cr&eacute;dito *
        </label>
        <select
          id="creditTypeId"
          name="creditTypeId"
          required
          defaultValue=""
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
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
        {state?.errors?.creditTypeId && (
          <p className="mt-1 text-sm text-red-600">
            {state.errors.creditTypeId}
          </p>
        )}
      </div>

      {/* Person type — hidden, MVP only supports SALARIED */}
      <input type="hidden" name="personType" value="SALARIED" />
      <div className="text-sm text-slate-500">
        Tipo de persona: Asalariado
      </div>

      {/* Property location */}
      <div>
        <label
          htmlFor="propertyLocation"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Ubicaci&oacute;n de la propiedad
        </label>
        <input
          id="propertyLocation"
          name="propertyLocation"
          type="text"
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="Ej. Av. Reforma 222, CDMX"
        />
      </div>

      {/* Requested amount */}
      <div>
        <label
          htmlFor="requestedAmount"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Monto solicitado
        </label>
        <input
          id="requestedAmount"
          name="requestedAmount"
          type="number"
          min="0"
          step="0.01"
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="1500000"
        />
      </div>

      {/* Property value */}
      <div>
        <label
          htmlFor="propertyValue"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Valor de la propiedad
        </label>
        <input
          id="propertyValue"
          name="propertyValue"
          type="number"
          min="0"
          step="0.01"
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="2000000"
        />
      </div>

      {/* Estimated term (months) */}
      <div>
        <label
          htmlFor="estimatedTermMonths"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Plazo estimado (meses)
        </label>
        <input
          id="estimatedTermMonths"
          name="estimatedTermMonths"
          type="number"
          min="1"
          step="1"
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="240"
        />
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Notas
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="Informaci&oacute;n adicional del expediente"
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {pending ? "Guardando..." : "Guardar expediente"}
        </button>
        <Link
          href="/dashboard/expedientes"
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
