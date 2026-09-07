"use client";

import Link from "next/link";
import {
  ArrowLeft,
  SlidersHorizontal,
  FileText,
  AlertTriangle,
  Percent,
  Table2,
} from "lucide-react";
import { useTransition, useState, useEffect } from "react";
import type { BankDetail, PfaeFactorMode, TaxReturnPolicy } from "@/app/lib/definitions";
import {
  INCOME_CRITERION_LABELS,
  PFAE_FACTOR_MODE_LABELS,
  TAX_RETURN_POLICY_LABELS,
} from "@/app/lib/definitions";
import { updateBank } from "@/app/actions/banks";
import Card from "@/app/ui/common/card";
import PolicyEditor from "@/app/ui/banks/policy-editor";
import ActivityFactorsEditor, {
  coerceNumber,
  formatFactor,
  parseFactor,
  sanitizeFactorDraft,
} from "@/app/ui/banks/activity-factors-editor";

interface BankDetailCardProps {
  bank: BankDetail;
}

export default function BankDetailCard({ bank }: BankDetailCardProps) {
  const [isPending, startTransition] = useTransition();
  const [showGeneralConfirm, setShowGeneralConfirm] = useState(false);

  const [incomeCriterion, setIncomeCriterion] = useState<"NET" | "GROSS">(
    bank.incomeCriterion
  );
  const [debtPct, setDebtPct] = useState<number>(
    Math.round(bank.debtCommitmentFactor * 100)
  );
  const [minimumBureauScore, setMinimumBureauScore] = useState<number | null>(
    bank.minimumBureauScore
  );
  const [bankIsActive, setBankIsActive] = useState<boolean>(bank.isActive);

  const [showPfaeConfirm, setShowPfaeConfirm] = useState(false);
  const [pfaeSaveError, setPfaeSaveError] = useState<string | null>(null);
  const [pfaeFactorMode, setPfaeFactorMode] = useState<PfaeFactorMode>(
    bank.pfaeFactorMode ?? "MATRIX",
  );
  const [pfaeFlatFactor, setPfaeFlatFactor] = useState<number | null>(
    coerceNumber(bank.pfaeFlatFactor),
  );
  const [pfaeFlatDraft, setPfaeFlatDraft] = useState(
    coerceNumber(bank.pfaeFlatFactor) == null
      ? ""
      : formatFactor(coerceNumber(bank.pfaeFlatFactor) as number),
  );
  const [taxReturnPolicy, setTaxReturnPolicy] = useState<TaxReturnPolicy>(
    bank.taxReturnPolicy ?? "ACCEPTED",
  );

  useEffect(() => {
    setIncomeCriterion(bank.incomeCriterion);
    setDebtPct(Math.round(bank.debtCommitmentFactor * 100));
    setMinimumBureauScore(bank.minimumBureauScore);
    setBankIsActive(bank.isActive);
    setPfaeFactorMode(bank.pfaeFactorMode ?? "MATRIX");
    const flat = coerceNumber(bank.pfaeFlatFactor);
    setPfaeFlatFactor(flat);
    setPfaeFlatDraft(flat == null ? "" : formatFactor(flat));
    setTaxReturnPolicy(bank.taxReturnPolicy ?? "ACCEPTED");
  }, [bank]);

  const hasGeneralChanges =
    incomeCriterion !== bank.incomeCriterion ||
    debtPct !== Math.round(bank.debtCommitmentFactor * 100) ||
    minimumBureauScore !== bank.minimumBureauScore ||
    bankIsActive !== bank.isActive;

  const originalFlat = coerceNumber(bank.pfaeFlatFactor);
  const hasPfaeChanges =
    pfaeFactorMode !== (bank.pfaeFactorMode ?? "MATRIX") ||
    pfaeFlatFactor !== originalFlat ||
    taxReturnPolicy !== (bank.taxReturnPolicy ?? "ACCEPTED");

  const handleConfirmGeneralSave = () => {
    startTransition(async () => {
      await updateBank(bank.code, {
        incomeCriterion,
        debtCommitmentFactor: debtPct / 100,
        minimumBureauScore,
        isActive: bankIsActive,
      });
      setShowGeneralConfirm(false);
    });
  };

  const handleConfirmPfaeSave = () => {
    setPfaeSaveError(null);
    startTransition(async () => {
      const result = await updateBank(bank.code, {
        pfaeFactorMode,
        pfaeFlatFactor,
        taxReturnPolicy,
      });
      if (!result.ok) {
        setPfaeSaveError(
          result.errors._form ??
            result.errors.pfaeFlatFactor ??
            "No se pudieron guardar los parámetros PFAE.",
        );
        return;
      }
      setShowPfaeConfirm(false);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/bancos"
          className="flex items-center gap-2 text-sm font-medium text-gf-text-muted hover:text-gf-red transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Bancos
        </Link>
      </div>

      {/* Bank General Parameters card */}
      <Card className={isPending ? "opacity-75 transition-opacity" : ""}>
        <div className="flex items-center justify-between border-b border-gf-border pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gf-red-soft text-gf-red">
              <BuildingIcon />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gf-text">{bank.name}</h1>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    bankIsActive
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-gray-100 text-gray-600 border border-gray-300"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                      bankIsActive ? "bg-emerald-500" : "bg-gray-400"
                    }`}
                  />
                  {bankIsActive ? "Banco Activo" : "Banco Inactivo"}
                </span>
              </div>
              <p className="text-xs text-gf-text-muted mt-0.5">
                {INCOME_CRITERION_LABELS[bank.incomeCriterion] ?? bank.incomeCriterion}
                {" · "}
                CE: {Math.round(bank.debtCommitmentFactor * 100)}%
                {" · "}
                Score mín: {bank.minimumBureauScore ?? "—"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowGeneralConfirm(true)}
            disabled={!hasGeneralChanges || isPending}
            className="px-4 py-2 text-xs font-semibold rounded-full bg-gf-red hover:bg-gf-red-dark text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
          >
            {isPending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>

        {/* Warning banner when Bank is inactive */}
        {!bankIsActive && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center gap-3 text-xs text-amber-800 font-medium mb-5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Este banco se encuentra actualmente <strong>Inactivo</strong>. Ninguno de sus objetivos de crédito será evaluado en el motor de viabilidad de expedientes.
            </span>
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold text-gf-text flex items-center gap-2 mb-4">
            <SlidersHorizontal className="w-4 h-4 text-gf-red" />
            Parámetros Generales
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Bank name — readonly */}
            <div>
              <label className="block text-xs font-medium text-gf-text-muted mb-1">
                Nombre de Institución
              </label>
              <div className="h-10 rounded-[10px] border border-gf-border bg-gf-surface-dim/60 px-3 flex items-center text-sm text-gf-text-muted font-medium">
                {bank.name}
              </div>
            </div>

            {/* Income criterion dropdown */}
            <div>
              <label className="block text-xs font-medium text-gf-text-muted mb-1">
                Tipo de Ingreso Evaluado
              </label>
              <select
                value={incomeCriterion}
                onChange={(e) => setIncomeCriterion(e.target.value as "NET" | "GROSS")}
                className="h-10 w-full rounded-[10px] border border-gf-border bg-white px-3 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red font-medium"
              >
                <option value="NET">Neto (Libre)</option>
                <option value="GROSS">Bruto (Antes de imptos)</option>
              </select>
            </div>

            {/* Debt commitment factor (%) */}
            <div>
              <label className="block text-xs font-medium text-gf-text-muted mb-1">
                Factor CE (Capacidad)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={debtPct}
                  onChange={(e) => setDebtPct(Number(e.target.value))}
                  className="h-10 w-full rounded-[10px] border border-gf-border bg-white px-3 pr-8 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red font-medium"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gf-text-muted pointer-events-none">
                  %
                </span>
              </div>
            </div>

            {/* Minimum bureau score */}
            <div>
              <label className="block text-xs font-medium text-gf-text-muted mb-1">
                Score Mínimo Buró
              </label>
              <input
                type="number"
                value={minimumBureauScore ?? ""}
                onChange={(e) =>
                  setMinimumBureauScore(e.target.value === "" ? null : Number(e.target.value))
                }
                placeholder="Sin mínimo"
                className="h-10 w-full rounded-[10px] border border-gf-border bg-white px-3 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red font-medium"
              />
            </div>

            {/* Bank Active Status */}
            <div>
              <label className="block text-xs font-medium text-gf-text-muted mb-1">
                Estado del Banco
              </label>
              <select
                value={bankIsActive ? "active" : "inactive"}
                onChange={(e) => setBankIsActive(e.target.value === "active")}
                className={`h-10 w-full rounded-[10px] border px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red ${
                  bankIsActive
                    ? "border-emerald-300 text-emerald-700 bg-emerald-50/50"
                    : "border-gray-300 text-gray-600 bg-gray-50"
                }`}
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* PFAE factor card */}
      <Card className={isPending ? "opacity-75 transition-opacity" : ""}>
        <div className="flex items-center justify-between border-b border-gf-border pb-4 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-gf-text flex items-center gap-2">
              <Percent className="w-4 h-4 text-gf-red" />
              Parámetros PFAE
            </h2>
            <p className="text-xs text-gf-text-muted mt-1">
              {PFAE_FACTOR_MODE_LABELS[pfaeFactorMode]}
              {" · "}
              {TAX_RETURN_POLICY_LABELS[taxReturnPolicy]}
              {pfaeFactorMode === "FLAT" && pfaeFlatFactor != null
                ? ` · Factor plano: ${formatFactor(pfaeFlatFactor)}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPfaeSaveError(null);
              setShowPfaeConfirm(true);
            }}
            disabled={!hasPfaeChanges || isPending}
            className="px-4 py-2 text-xs font-semibold rounded-full bg-gf-red hover:bg-gf-red-dark text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
          >
            {isPending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>

        {pfaeSaveError && (
          <div
            role="alert"
            className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700"
          >
            {pfaeSaveError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="pfae-factor-mode"
              className="block text-xs font-medium text-gf-text-muted mb-1"
            >
              Modo de factor
            </label>
            <select
              id="pfae-factor-mode"
              value={pfaeFactorMode}
              onChange={(e) =>
                setPfaeFactorMode(e.target.value as PfaeFactorMode)
              }
              className="h-10 w-full rounded-[10px] border border-gf-border bg-white px-3 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red font-medium"
            >
              <option value="MATRIX">{PFAE_FACTOR_MODE_LABELS.MATRIX}</option>
              <option value="FLAT">{PFAE_FACTOR_MODE_LABELS.FLAT}</option>
              <option value="NONE">{PFAE_FACTOR_MODE_LABELS.NONE}</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="pfae-flat-factor"
              className="block text-xs font-medium text-gf-text-muted mb-1"
            >
              Factor plano
            </label>
            <input
              id="pfae-flat-factor"
              type="text"
              inputMode="decimal"
              disabled={pfaeFactorMode !== "FLAT"}
              value={pfaeFlatDraft}
              placeholder={pfaeFactorMode === "FLAT" ? "0.6" : "Solo en factor plano"}
              onChange={(e) => {
                const next = sanitizeFactorDraft(e.target.value);
                setPfaeFlatDraft(next);
                setPfaeFlatFactor(parseFactor(next));
              }}
              className="h-10 w-full rounded-[10px] border border-gf-border bg-white px-3 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red font-medium tabular-nums disabled:bg-gf-surface-dim/60 disabled:text-gf-text-muted"
            />
          </div>

          <div>
            <label
              htmlFor="tax-return-policy"
              className="block text-xs font-medium text-gf-text-muted mb-1"
            >
              ¿Acepta declaración?
            </label>
            <select
              id="tax-return-policy"
              value={taxReturnPolicy}
              onChange={(e) =>
                setTaxReturnPolicy(e.target.value as TaxReturnPolicy)
              }
              className="h-10 w-full rounded-[10px] border border-gf-border bg-white px-3 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red font-medium"
            >
              <option value="ACCEPTED">
                {TAX_RETURN_POLICY_LABELS.ACCEPTED}
              </option>
              <option value="NOT_PREFERRED">
                {TAX_RETURN_POLICY_LABELS.NOT_PREFERRED}
              </option>
              <option value="REJECTED">
                {TAX_RETURN_POLICY_LABELS.REJECTED}
              </option>
            </select>
          </div>
        </div>
      </Card>

      {/* Activity factors (tabla de giros) */}
      <Card>
        <div className="border-b border-gf-border pb-3 mb-4">
          <h2 className="text-sm font-semibold text-gf-text flex items-center gap-2">
            <Table2 className="w-4 h-4 text-gf-red" />
            Tabla de giros
          </h2>
          <p className="text-xs text-gf-text-muted mt-1">
            Factores por actividad (pueden ser mayores a 1, p. ej. salud Mifel 1.5).
            El factor de declaración es opcional (BX+). La matriz aplica cuando el
            modo de factor es Matriz de giros.
          </p>
        </div>
        <ActivityFactorsEditor
          bankCode={bank.code}
          factors={bank.activityFactors ?? []}
        />
      </Card>

      {/* Policies card */}
      <Card>
        <div className="border-b border-gf-border pb-3 mb-4">
          <h2 className="text-sm font-semibold text-gf-text flex items-center gap-2">
            <FileText className="w-4 h-4 text-gf-red" />
            Políticas por Objetivo del Crédito
          </h2>
          <p className="text-xs text-gf-text-muted mt-1">
            Haz clic en los valores numéricos para editarlos directamente. La edad mínima y máxima se gestionan en años.
            Las celdas PFAE vacías usan el valor asalariado.
          </p>
        </div>
        <PolicyEditor bankCode={bank.code} policies={bank.policies} />
      </Card>

      {/* Confirmation Modal for General Parameters */}
      {showGeneralConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gf-text">
                Confirmar cambios en parámetros generales
              </h3>
            </div>

            <div className="space-y-3 text-sm text-gf-text-muted">
              <p>
                Está a punto de modificar los parámetros generales de{" "}
                <strong className="text-gf-text">{bank.name}</strong> (Tipo de ingreso, Factor CE, Score mínimo o Estado del Banco).
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                <p className="font-semibold text-amber-950">
                  ⚠️ Aviso de impacto en análisis:
                </p>
                <p>
                  • Este cambio afectará todas las evaluaciones de viabilidad que se ejecuten a partir de este momento.
                </p>
                <p>
                  • Los expedientes ya analizados <strong>no se verán alterados</strong> y mantendrán su historial con los parámetros vigentes al momento de su evaluación.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowGeneralConfirm(false)}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold rounded-full border border-gf-border text-gf-text hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmGeneralSave}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold rounded-full bg-gf-red hover:bg-gf-red-dark text-white transition-colors flex items-center gap-1.5 shadow-xs"
              >
                {isPending ? "Guardando..." : "Confirmar y guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPfaeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pfae-confirm-title"
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150"
          >
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 id="pfae-confirm-title" className="text-lg font-bold text-gf-text">
                Confirmar cambios PFAE
              </h3>
            </div>

            <div className="space-y-3 text-sm text-gf-text-muted">
              <p>
                Está a punto de modificar modo de factor, factor plano o si acepta
                declaración para{" "}
                <strong className="text-gf-text">{bank.name}</strong>.
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                <p className="font-semibold text-amber-950">
                  ⚠️ Aviso de impacto en análisis:
                </p>
                <p>
                  • Este cambio afectará las evaluaciones PFAE que se ejecuten a
                  partir de este momento.
                </p>
                <p>
                  • Los expedientes ya analizados <strong>no se verán alterados</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPfaeConfirm(false)}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold rounded-full border border-gf-border text-gf-text hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPfaeSave}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold rounded-full bg-gf-red hover:bg-gf-red-dark text-white transition-colors flex items-center gap-1.5 shadow-xs"
              >
                {isPending ? "Guardando..." : "Confirmar y guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BuildingIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  );
}
