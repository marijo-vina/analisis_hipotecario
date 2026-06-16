"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateClient } from "@/app/actions/clients";
import ErrorMessage from "@/app/ui/error-message";
import type { Client, ActionState } from "@/app/lib/definitions";

const initialState: ActionState = { errors: {} };

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
    <form action={formAction} className="space-y-4">
      {/* General form error */}
      <ErrorMessage message={state?.errors?._form} />

      {/* First name */}
      <div>
        <label
          htmlFor="firstName"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Nombre *
        </label>
        <input
          id="firstName"
          name="firstName"
          type="text"
          required
          defaultValue={client.firstName}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="Ej. Juan"
        />
        {state?.errors?.firstName && (
          <p className="mt-1 text-sm text-red-600">
            {state.errors.firstName}
          </p>
        )}
      </div>

      {/* Paternal last name */}
      <div>
        <label
          htmlFor="paternalLastName"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Apellido paterno *
        </label>
        <input
          id="paternalLastName"
          name="paternalLastName"
          type="text"
          required
          defaultValue={client.paternalLastName}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="Ej. Garc&iacute;a"
        />
        {state?.errors?.paternalLastName && (
          <p className="mt-1 text-sm text-red-600">
            {state.errors.paternalLastName}
          </p>
        )}
      </div>

      {/* Maternal last name */}
      <div>
        <label
          htmlFor="maternalLastName"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Apellido materno
        </label>
        <input
          id="maternalLastName"
          name="maternalLastName"
          type="text"
          defaultValue={client.maternalLastName ?? ""}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="Ej. L&oacute;pez"
        />
      </div>

      {/* RFC */}
      <div>
        <label
          htmlFor="rfc"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          RFC
        </label>
        <input
          id="rfc"
          name="rfc"
          type="text"
          defaultValue={client.rfc ?? ""}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="XXXX000000XXX"
        />
        {state?.errors?.rfc && (
          <p className="mt-1 text-sm text-red-600">{state.errors.rfc}</p>
        )}
      </div>

      {/* CURP */}
      <div>
        <label
          htmlFor="curp"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          CURP
        </label>
        <input
          id="curp"
          name="curp"
          type="text"
          defaultValue={client.curp ?? ""}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="XXXX000000XXXXXX00"
        />
        {state?.errors?.curp && (
          <p className="mt-1 text-sm text-red-600">{state.errors.curp}</p>
        )}
      </div>

      {/* Email */}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Email *
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={client.email}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="correo@ejemplo.com"
        />
        {state?.errors?.email && (
          <p className="mt-1 text-sm text-red-600">{state.errors.email}</p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label
          htmlFor="phone"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Tel&eacute;fono *
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          defaultValue={client.phone}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="5512345678"
        />
        {state?.errors?.phone && (
          <p className="mt-1 text-sm text-red-600">{state.errors.phone}</p>
        )}
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {pending ? "Guardando..." : "Actualizar cliente"}
        </button>
        <Link
          href={`/dashboard/clientes/${client.id}`}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
