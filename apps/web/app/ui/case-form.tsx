"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { createCase } from "@/app/actions/cases";
import ClientSelector from "@/app/ui/client-selector";
import type { ActionState, Client, CreditType } from "@/app/lib/definitions";
import {
  FolderOpen,
  User,
  Building2,
  CreditCard,
  MapPin,
  FileText,
  ArrowLeft,
  Save,
  AlertCircle,
} from "lucide-react";

const initialState: ActionState = { errors: {} };

const INPUT_CLASS =
  "h-12 w-full px-4 rounded-[10px] border border-gf-border bg-white text-sm text-gf-text " +
  "placeholder-gf-text-muted focus:border-gf-red focus:ring-2 focus:ring-gf-red/20 focus:outline-none " +
  "transition-all duration-150";

const INPUT_CURRENCY_CLASS =
  "h-12 w-full pl-8 pr-4 rounded-[10px] border border-gf-border bg-white text-sm font-medium text-gf-text " +
  "placeholder-gf-text-muted focus:border-gf-red focus:ring-2 focus:ring-gf-red/20 focus:outline-none " +
  "transition-all duration-150";

const TEXTAREA_CLASS =
  "w-full px-4 py-3 rounded-[10px] border border-gf-border bg-white text-sm text-gf-text " +
  "placeholder-gf-text-muted focus:border-gf-red focus:ring-2 focus:ring-gf-red/20 focus:outline-none " +
  "transition-all duration-150 resize-none";

/** Helper to format string into Mexican Pesos thousand separators in real-time */
function formatPesoGroup(raw: string): string {
  const digitsOnly = raw.replace(/[^0-9]/g, "");
  if (!digitsOnly) return "";
  const parsed = parseInt(digitsOnly, 10);
  return parsed.toLocaleString("es-MX");
}

interface CaseFormProps {
  creditTypes: CreditType[];
  clients: Client[];
  initialClientId?: string;
}

export default function CaseForm({ creditTypes, clients, initialClientId }: CaseFormProps) {
  const [state, formAction, pending] = useActionState(
    createCase,
    initialState
  );

  // Term management (Years in UI, calculated to Months for backend)
  const [selectedTermYears, setSelectedTermYears] = useState<string>("20");
  const [customTermYears, setCustomTermYears] = useState<string>("");

  // Currency formatted values
  const [propValueFormatted, setPropValueFormatted] = useState<string>("");
  const [personType, setPersonType] = useState<string>("SALARIED");

  // Calculate final term in months
  const termInYears =
    selectedTermYears === "otro"
      ? parseInt(customTermYears, 10) || 0
      : parseInt(selectedTermYears, 10) || 20;

  const estimatedTermMonths = termInYears > 0 ? termInYears * 12 : 240;

  return (
    <div className="flex flex-col items-center w-full max-w-6xl mx-auto py-4">
      {/* Transactional Back Navigation Header */}
      <div className="w-full flex items-center gap-3 mb-6">
        <Link
          href="/dashboard/expedientes"
          className="p-2 rounded-full text-gf-text-muted hover:text-gf-red hover:bg-gf-surface-dim transition-colors"
          aria-label="Volver a Expedientes"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gf-text tracking-tight">
            Gestión Financiera
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
          <div className="flex items-center gap-4 mb-1">
            <div className="w-12 h-12 rounded-xl bg-gf-red/10 flex items-center justify-center text-gf-red shrink-0">
              <FolderOpen className="w-6 h-6" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gf-text">Nuevo expediente</h2>
              <p className="text-xs text-gf-text-muted">
                Complete los datos iniciales para comenzar el proceso hipotecario.
              </p>
            </div>
          </div>
        </div>

        <form action={formAction} className="p-6 md:p-8 space-y-10">
          {/* General form error banner */}
          {state?.errors?._form && (
            <div
              className="rounded-[10px] bg-red-50 border border-red-200 p-3.5 text-xs font-medium text-red-700 flex items-center gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" strokeWidth={2} />
              <span>{state.errors._form}</span>
            </div>
          )}

          {/* ── Sección 1: Información del cliente ──────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 border-b border-gf-border-variant pb-2.5">
              <div className="w-8 h-8 rounded-lg bg-gf-red/10 flex items-center justify-center text-gf-red shrink-0">
                <User className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="text-sm font-semibold text-gf-text uppercase tracking-wider">
                Información del cliente
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Cliente */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label htmlFor="clientId" className="text-xs font-semibold text-gf-text">
                  Cliente <span className="text-gf-red">*</span>
                </label>
                <ClientSelector clients={clients} initialClientId={initialClientId} />
                {state?.errors?.clientId && (
                  <p className="text-xs text-red-600 mt-0.5">{state.errors.clientId}</p>
                )}
              </div>

              {/* Perfil del solicitante */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label htmlFor="personType" className="text-xs font-semibold text-gf-text">
                  Perfil del solicitante
                </label>
                <select
                  id="personType"
                  name="personType"
                  value={personType}
                  onChange={(e) => setPersonType(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="SALARIED">Asalariado</option>
                  <option value="PFAE">Persona Física con Actividad Empresarial (PFAE)</option>
                  <option value="PM">Persona Moral</option>
                </select>
              </div>
            </div>
          </section>

          {personType === "PM" && (
            <section className="space-y-4">
              <div className="flex items-center gap-3 border-b border-gf-border-variant pb-2.5">
                <div className="w-8 h-8 rounded-lg bg-gf-red/10 flex items-center justify-center text-gf-red shrink-0">
                  <Building2 className="w-4 h-4" strokeWidth={2} />
                </div>
                <h3 className="text-sm font-semibold text-gf-text uppercase tracking-wider">
                  Datos de la persona moral
                </h3>
              </div>
              <p className="text-[11px] text-gf-text-muted">
                Campos opcionales. Puede completarlos ahora o más adelante.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="sharePercentage" className="text-xs font-semibold text-gf-text">
                    Porcentaje de participación
                  </label>
                  <input
                    id="sharePercentage"
                    name="sharePercentage"
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    className={INPUT_CLASS}
                    placeholder="25.50"
                  />
                  {state?.errors?.sharePercentage && (
                    <p className="text-xs text-red-600 mt-0.5">{state.errors.sharePercentage}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="incorporationDate" className="text-xs font-semibold text-gf-text">
                    Fecha de constitución
                  </label>
                  <input
                    id="incorporationDate"
                    name="incorporationDate"
                    type="date"
                    className={INPUT_CLASS}
                  />
                  {state?.errors?.incorporationDate && (
                    <p className="text-xs text-red-600 mt-0.5">{state.errors.incorporationDate}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="legalName" className="text-xs font-semibold text-gf-text">
                    Razón social
                  </label>
                  <input
                    id="legalName"
                    name="legalName"
                    type="text"
                    maxLength={255}
                    className={INPUT_CLASS}
                    placeholder="Empresa Ejemplo, S.A. de C.V."
                  />
                  {state?.errors?.legalName && (
                    <p className="text-xs text-red-600 mt-0.5">{state.errors.legalName}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label htmlFor="companyRfc" className="text-xs font-semibold text-gf-text">
                    RFC de la empresa
                  </label>
                  <input
                    id="companyRfc"
                    name="companyRfc"
                    type="text"
                    maxLength={12}
                    className={`${INPUT_CLASS} uppercase`}
                    placeholder="EME850101XX1"
                    autoComplete="off"
                  />
                  {state?.errors?.companyRfc && (
                    <p className="text-xs text-red-600 mt-0.5">{state.errors.companyRfc}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ── Sección 2: Información del crédito ──────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 border-b border-gf-border-variant pb-2.5">
              <div className="w-8 h-8 rounded-lg bg-gf-red/10 flex items-center justify-center text-gf-red shrink-0">
                <CreditCard className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="text-sm font-semibold text-gf-text uppercase tracking-wider">
                Información del crédito
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Objetivo del crédito */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="creditTypeId" className="text-xs font-semibold text-gf-text">
                  Objetivo del crédito <span className="text-gf-red">*</span>
                </label>
                <select
                  id="creditTypeId"
                  name="creditTypeId"
                  required
                  defaultValue=""
                  className={INPUT_CLASS}
                >
                  <option value="" disabled>
                    Seleccione un objetivo...
                  </option>
                  {creditTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name}
                    </option>
                  ))}
                </select>
                {state?.errors?.creditTypeId && (
                  <p className="text-xs text-red-600 mt-0.5">{state.errors.creditTypeId}</p>
                )}
              </div>

              {/* Plazo del crédito (Años en UI ➔ Meses al backend) */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="termYearsSelect" className="text-xs font-semibold text-gf-text">
                  Plazo del crédito
                </label>
                <select
                  id="termYearsSelect"
                  value={selectedTermYears}
                  onChange={(e) => setSelectedTermYears(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="10">10 años</option>
                  <option value="15">15 años</option>
                  <option value="20">20 años (predeterminado)</option>
                  <option value="25">25 años</option>
                  <option value="30">30 años</option>
                  <option value="otro">Otro...</option>
                </select>

                {/* Input condicional si selecciona "Otro" */}
                {selectedTermYears === "otro" && (
                  <div className="mt-2 flex flex-col gap-1">
                    <input
                      type="number"
                      min="1"
                      max="40"
                      value={customTermYears}
                      onChange={(e) => setCustomTermYears(e.target.value)}
                      placeholder="Escriba el plazo en años (ej. 12)"
                      className={INPUT_CLASS}
                    />
                    <p className="text-[11px] text-gf-text-muted">
                      Equivalente a {(parseInt(customTermYears, 10) || 0) * 12} meses para comparativa bancaria.
                    </p>
                  </div>
                )}

                {/* Valor real enviado al backend en meses */}
                <input
                  type="hidden"
                  name="estimatedTermMonths"
                  value={estimatedTermMonths}
                />
                {state?.errors?.estimatedTermMonths && (
                  <p className="text-xs text-red-600 mt-0.5">{state.errors.estimatedTermMonths}</p>
                )}
              </div>



              {/* Valor del inmueble (Pesos MXN) */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="propertyValue" className="text-xs font-semibold text-gf-text">
                  Valor del inmueble
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-gf-text-muted font-bold text-sm pointer-events-none">$</span>
                  <input
                    id="propertyValue"
                    name="propertyValue"
                    type="text"
                    inputMode="numeric"
                    value={propValueFormatted}
                    onChange={(e) => setPropValueFormatted(formatPesoGroup(e.target.value))}
                    placeholder="2,500,000"
                    className={INPUT_CURRENCY_CLASS}
                  />
                </div>
                <p className="text-[11px] text-gf-text-muted">Valor estimativo en pesos mexicanos (MXN)</p>
                {state?.errors?.propertyValue && (
                  <p className="text-xs text-red-600 mt-0.5">{state.errors.propertyValue}</p>
                )}
              </div>
            </div>
          </section>

          {/* ── Sección 3: Información del inmueble ────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 border-b border-gf-border-variant pb-2.5">
              <div className="w-8 h-8 rounded-lg bg-gf-red/10 flex items-center justify-center text-gf-red shrink-0">
                <MapPin className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="text-sm font-semibold text-gf-text uppercase tracking-wider">
                Información del inmueble
              </h3>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="propertyLocation" className="text-xs font-semibold text-gf-text">
                Dirección del inmueble
              </label>
              <textarea
                id="propertyLocation"
                name="propertyLocation"
                rows={3}
                className={TEXTAREA_CLASS}
                placeholder="Calle, número exterior/interior, colonia, C.P., Ciudad y Estado..."
              />
              {state?.errors?.propertyLocation && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.propertyLocation}</p>
              )}
            </div>
          </section>

          {/* ── Sección 4: Observaciones ───────────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 border-b border-gf-border-variant pb-2.5">
              <div className="w-8 h-8 rounded-lg bg-gf-red/10 flex items-center justify-center text-gf-red shrink-0">
                <FileText className="w-4 h-4" strokeWidth={2} />
              </div>
              <h3 className="text-sm font-semibold text-gf-text uppercase tracking-wider">
                Observaciones
              </h3>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="notes" className="text-xs font-semibold text-gf-text">
                Comentarios adicionales
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={4}
                className={TEXTAREA_CLASS}
                placeholder="Agregue cualquier nota relevante para el análisis inicial..."
              />
              {state?.errors?.notes && (
                <p className="text-xs text-red-600 mt-0.5">{state.errors.notes}</p>
              )}
            </div>
          </section>

          {/* ── Form Action Buttons ────────────────────────────────── */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-6 border-t border-gf-border">
            <Link
              href="/dashboard/expedientes"
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
              <span>{pending ? "Guardando..." : "Crear expediente"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
