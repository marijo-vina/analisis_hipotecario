"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createClient } from "@/app/actions/clients";
import type { ActionState } from "@/app/lib/definitions";
import {
  UserPlus,
  Mail,
  Phone,
  ArrowLeft,
  Save,
  AlertCircle,
} from "lucide-react";

const initialState: ActionState = { errors: {} };

const INPUT_CLASS =
  "h-12 w-full px-4 rounded-[10px] border border-gf-border bg-white text-sm text-gf-text " +
  "placeholder-gf-text-muted focus:border-gf-red focus:ring-2 focus:ring-gf-red/20 focus:outline-none " +
  "transition-all duration-150";

const INPUT_WITH_ICON_CLASS =
  "h-12 w-full pl-11 pr-4 rounded-[10px] border border-gf-border bg-white text-sm text-gf-text " +
  "placeholder-gf-text-muted focus:border-gf-red focus:ring-2 focus:ring-gf-red/20 focus:outline-none " +
  "transition-all duration-150";

export default function ClientForm() {
  const [state, formAction, pending] = useActionState(
    createClient,
    initialState
  );

  return (
    <div className="flex flex-col items-center w-full max-w-6xl mx-auto py-4">
      {/* Transactional Back Navigation Header */}
      <div className="w-full flex items-center gap-3 mb-6">
        <Link
          href="/dashboard/clientes"
          className="p-2 rounded-full text-gf-text-muted hover:text-gf-red hover:bg-gf-surface-dim transition-colors"
          aria-label="Volver a Clientes"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gf-text tracking-tight">
            Gestión de Clientes
          </h1>
          <p className="text-xs text-gf-text-muted">
            Operaciones Hipotecarias
          </p>
        </div>
      </div>

      {/* Main Form Container Card */}
      <div className="w-full bg-white border border-gf-border shadow-[0px_4px_12px_rgba(0,0,0,0.03)] rounded-[12px] overflow-hidden">
        {/* Card Header */}
        <div className="p-6 md:p-8 border-b border-gf-border bg-gf-surface-dim/40">
          <div className="flex items-center gap-3 mb-1.5">
            <UserPlus className="w-6 h-6 text-gf-red shrink-0" strokeWidth={2} />
            <h2 className="text-xl font-bold text-gf-text">Crear Cliente</h2>
          </div>
          <p className="text-xs text-gf-text-muted">
            Ingrese los datos personales y de identificación oficial del nuevo cliente hipotecario.
          </p>
        </div>

        <form action={formAction} className="p-6 md:p-8 space-y-8">
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

          {/* ── Sección: Datos Personales ──────────────────────────── */}
          <div>
            <h3 className="text-sm font-semibold text-gf-text uppercase tracking-wider mb-4 pb-2 border-b border-gf-border-variant">
              Datos Personales
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Nombre */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="firstName" className="text-xs font-semibold text-gf-text">
                  Nombre <span className="text-gf-red">*</span>
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  className={INPUT_CLASS}
                  placeholder="Ej. Juan Carlos"
                />
                {state?.errors?.firstName && (
                  <p className="text-xs text-red-600 mt-0.5">{state.errors.firstName}</p>
                )}
              </div>

              {/* Apellido paterno */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="paternalLastName" className="text-xs font-semibold text-gf-text">
                  Apellido paterno <span className="text-gf-red">*</span>
                </label>
                <input
                  id="paternalLastName"
                  name="paternalLastName"
                  type="text"
                  required
                  className={INPUT_CLASS}
                  placeholder="Ej. Pérez"
                />
                {state?.errors?.paternalLastName && (
                  <p className="text-xs text-red-600 mt-0.5">{state.errors.paternalLastName}</p>
                )}
              </div>

              {/* Apellido materno */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="maternalLastName" className="text-xs font-semibold text-gf-text">
                  Apellido materno
                </label>
                <input
                  id="maternalLastName"
                  name="maternalLastName"
                  type="text"
                  className={INPUT_CLASS}
                  placeholder="Ej. Gómez"
                />
              </div>

              {/* Correo electrónico */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-xs font-semibold text-gf-text">
                  Correo electrónico <span className="text-gf-red">*</span>
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 absolute left-3.5 text-gf-text-muted pointer-events-none" strokeWidth={2} />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className={INPUT_WITH_ICON_CLASS}
                    placeholder="cliente@correo.com"
                  />
                </div>
                {state?.errors?.email && (
                  <p className="text-xs text-red-600 mt-0.5">{state.errors.email}</p>
                )}
              </div>

              {/* Teléfono — sólo números, máx 10 dígitos */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="phone" className="text-xs font-semibold text-gf-text">
                  Teléfono <span className="text-gf-red">*</span>
                </label>
                <div className="relative flex items-center">
                  <Phone className="w-4 h-4 absolute left-3.5 text-gf-text-muted pointer-events-none" strokeWidth={2} />
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    required
                    inputMode="numeric"
                    maxLength={10}
                    pattern="[0-9]{10}"
                    onInput={(e) => {
                      e.currentTarget.value = e.currentTarget.value.replace(/[^0-9]/g, "").slice(0, 10);
                    }}
                    className={INPUT_WITH_ICON_CLASS}
                    placeholder="5512345678"
                  />
                </div>
                <p className="text-[11px] text-gf-text-muted">Exactamente 10 dígitos numéricos</p>
                {state?.errors?.phone && (
                  <p className="text-xs text-red-600 mt-0.5">{state.errors.phone}</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Sección: Identificación Oficial ───────────────────── */}
          <div>
            <h3 className="text-sm font-semibold text-gf-text uppercase tracking-wider mb-4 pb-2 border-b border-gf-border-variant">
              Identificación Oficial
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* RFC */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="rfc" className="text-xs font-semibold text-gf-text">
                  RFC
                </label>
                <input
                  id="rfc"
                  name="rfc"
                  type="text"
                  minLength={12}
                  maxLength={13}
                  className={`${INPUT_CLASS} uppercase`}
                  placeholder="XAXX010101000"
                />
                <p className="text-[11px] text-gf-text-muted">12-13 caracteres</p>
                {state?.errors?.rfc && (
                  <p className="text-xs text-red-600 mt-0.5">{state.errors.rfc}</p>
                )}
              </div>

              {/* CURP */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="curp" className="text-xs font-semibold text-gf-text">
                  CURP
                </label>
                <input
                  id="curp"
                  name="curp"
                  type="text"
                  minLength={18}
                  maxLength={18}
                  className={`${INPUT_CLASS} uppercase`}
                  placeholder="ABCD010101HDFXXX00"
                />
                <p className="text-[11px] text-gf-text-muted">18 caracteres</p>
                {state?.errors?.curp && (
                  <p className="text-xs text-red-600 mt-0.5">{state.errors.curp}</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Form Action Buttons ────────────────────────────────── */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-6 border-t border-gf-border">
            <Link
              href="/dashboard/clientes"
              className="w-full sm:w-auto h-12 px-6 rounded-[10px] border border-gf-border bg-white text-gf-text font-medium text-sm hover:bg-gf-surface-dim transition-colors flex items-center justify-center"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="w-full sm:w-auto h-12 px-8 rounded-[10px] bg-gf-red text-white font-medium text-sm shadow-sm hover:bg-gf-red-dark transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" strokeWidth={2} />
              <span>{pending ? "Guardando..." : "Guardar cliente"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
