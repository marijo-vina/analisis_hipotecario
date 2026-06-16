"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateCase } from "@/app/actions/cases";
import ErrorMessage from "@/app/ui/error-message";
import type { ActionState, CreditType, MortgageCase } from "@/app/lib/definitions";

const initialState: ActionState = { errors: {} };

interface CaseEditFormProps {
  mortgageCase: MortgageCase;
  creditTypes: CreditType[];
}

export default function CaseEditForm({ mortgageCase, creditTypes }: CaseEditFormProps) {
  const [state, formAction, pending] = useActionState(
    updateCase.bind(null, mortgageCase.id),
    initialState,
  );

  const defaultCreditTypeId = mortgageCase.creditType.id;

  return (
    <form action={formAction} className="space-y-4">
      {/* General form error */}
      <ErrorMessage message={state?.errors?._form} />

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
          defaultValue={defaultCreditTypeId ?? ""}
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
          defaultValue={mortgageCase.propertyLocation ?? ""}
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
          defaultValue={mortgageCase.requestedAmount ?? ""}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="1500000"
        />
        {state?.errors?.requestedAmount && (
          <p className="mt-1 text-sm text-red-600">
            {state.errors.requestedAmount}
          </p>
        )}
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
          defaultValue={mortgageCase.propertyValue ?? ""}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="2000000"
        />
        {state?.errors?.propertyValue && (
          <p className="mt-1 text-sm text-red-600">
            {state.errors.propertyValue}
          </p>
        )}
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
          defaultValue={mortgageCase.estimatedTermMonths ?? ""}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="240"
        />
        {state?.errors?.estimatedTermMonths && (
          <p className="mt-1 text-sm text-red-600">
            {state.errors.estimatedTermMonths}
          </p>
        )}
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
          defaultValue={mortgageCase.notes ?? ""}
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
          {pending ? "Guardando..." : "Actualizar expediente"}
        </button>
        <Link
          href={`/dashboard/expedientes/${mortgageCase.id}`}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
