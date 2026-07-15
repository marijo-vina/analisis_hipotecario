"use client";

import { useState, useEffect, type FormEvent } from "react";

import {
  LiabilityCreditNature,
  type LiabilityCreditResult,
} from "@/app/lib/extraction";

import { NATURE_LABELS } from "./liability-calculation-section";

interface EditCreditModalProps {
  /** The credit being corrected (from the snapshot's credits array) */
  credit: LiabilityCreditResult;
  /** Index within the snapshot credits array — used for the PATCH path */
  creditIndex: number;
  /** True while the override request is in flight */
  saving: boolean;
  onClose: () => void;
  onSubmit: (
    creditIndex: number,
    payload: {
      reason: string;
      creditNature?: "REVOLVING" | "FIXED";
      currentBalance?: number;
      paymentDueAmountEffective?: number;
    },
  ) => void;
}

const MIN_REASON_LENGTH = 10;

/**
 * EditCreditModal — manual correction dialog for credits flagged
 * REQUIRES_REVIEW or INCOMPLETE.
 *
 * Saldo / Monto a pagar inputs are only editable when the bureau value was
 * null (data missing). Naturaleza and reason are always editable. On submit
 * the parent calls PATCH /cases/:id/liability/credits/:index which triggers
 * a server-side recalculation.
 */
export default function EditCreditModal({
  credit,
  creditIndex,
  saving,
  onClose,
  onSubmit,
}: EditCreditModalProps) {
  // ── Form state ────────────────────────────────────────────────────────
  // Nature dropdown only allows REVOLVING / FIXED (never UNKNOWN).
  const initialNature =
    credit.creditNature === LiabilityCreditNature.FIXED
      ? "FIXED"
      : "REVOLVING";
  const [nature, setNature] = useState<"REVOLVING" | "FIXED">(initialNature);
  const [balance, setBalance] = useState<string>(
    credit.currentBalance !== null ? String(credit.currentBalance) : "",
  );
  const [payment, setPayment] = useState<string>(
    credit.paymentDueAmountEffective !== null
      ? String(credit.paymentDueAmountEffective)
      : "",
  );
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  const balanceEditable = credit.currentBalance === null;
  const paymentEditable = credit.paymentDueAmountEffective === null;

  // ── Body scroll lock ──────────────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ── Validation ────────────────────────────────────────────────────────
  const reasonValid = reason.trim().length >= MIN_REASON_LENGTH;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!reasonValid) return;

    const payload: {
      reason: string;
      creditNature?: "REVOLVING" | "FIXED";
      currentBalance?: number;
      paymentDueAmountEffective?: number;
    } = { reason: reason.trim() };

    // Only send nature if it changed from the original.
    if (nature !== initialNature) {
      payload.creditNature = nature;
    }

    if (balanceEditable && balance.trim() !== "") {
      const n = Number(balance);
      if (!Number.isNaN(n)) payload.currentBalance = n;
    }
    if (paymentEditable && payment.trim() !== "") {
      const n = Number(payment);
      if (!Number.isNaN(n)) payload.paymentDueAmountEffective = n;
    }

    onSubmit(creditIndex, payload);
  };

  const reasonError = touched && !reasonValid;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-credit-title"
    >
      <div
        className="flex w-full max-w-lg flex-col rounded-lg border border-gf-border bg-gf-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-gf-border px-6 py-4">
          <div className="min-w-0">
            <h2
              id="edit-credit-title"
              className="truncate text-lg font-semibold text-gf-text"
            >
              Corregir crédito
            </h2>
            <p className="mt-0.5 truncate text-sm text-gf-text-muted">
              {credit.creditType || credit.creditReference} —{" "}
              {credit.institution || "Sin institución"}
            </p>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* Impact warning banner — amber */}
          <div
            className="px-6 py-3 text-sm"
            style={{ backgroundColor: "#FFFBEB", color: "#92400E" }}
          >
            ⚠️ Este cambio recalculará los totales. Al modificar la naturaleza
            o los montos, el sistema recalculará automáticamente la deuda
            total mensual y el saldo actual total.
          </div>

          <div className="space-y-4 px-6 py-5">
            {/* Naturaleza */}
            <div>
              <label
                htmlFor="edit-nature"
                className="mb-1 block text-sm font-medium text-gf-text"
              >
                Naturaleza del crédito
              </label>
              <select
                id="edit-nature"
                value={nature}
                onChange={(e) =>
                  setNature(e.target.value as "REVOLVING" | "FIXED")
                }
                className="w-full rounded-md border border-gf-border px-3 py-2 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30"
              >
                <option value="REVOLVING">
                  {NATURE_LABELS[LiabilityCreditNature.REVOLVING]}
                </option>
                <option value="FIXED">
                  {NATURE_LABELS[LiabilityCreditNature.FIXED]}
                </option>
              </select>
            </div>

            {/* Saldo actual */}
            <div>
              <label
                htmlFor="edit-balance"
                className="mb-1 block text-sm font-medium text-gf-text"
              >
                Saldo actual
                {!balanceEditable && (
                  <span className="ml-1 text-xs text-gf-text-soft">
                    (reportado en Buró)
                  </span>
                )}
                {balanceEditable && (
                  <span className="ml-1 text-xs font-medium text-red-600">
                    dato faltante en Buró
                  </span>
                )}
              </label>
              <input
                id="edit-balance"
                type="number"
                step="0.01"
                min="0"
                value={balance}
                disabled={!balanceEditable}
                onChange={(e) => setBalance(e.target.value)}
                placeholder={
                  balanceEditable ? "Capture el saldo" : "—"
                }
                className="w-full rounded-md border border-gf-border px-3 py-2 text-sm text-gf-text disabled:cursor-not-allowed disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gf-red/30"
              />
            </div>

            {/* Monto a pagar */}
            <div>
              <label
                htmlFor="edit-payment"
                className="mb-1 block text-sm font-medium text-gf-text"
              >
                Monto a pagar
                {!paymentEditable && (
                  <span className="ml-1 text-xs text-gf-text-soft">
                    (reportado en Buró)
                  </span>
                )}
                {paymentEditable && (
                  <span className="ml-1 text-xs font-medium text-red-600">
                    dato faltante en Buró
                  </span>
                )}
              </label>
              <input
                id="edit-payment"
                type="number"
                step="0.01"
                min="0"
                value={payment}
                disabled={!paymentEditable}
                onChange={(e) => setPayment(e.target.value)}
                placeholder={
                  paymentEditable ? "Capture el monto a pagar" : "—"
                }
                className="w-full rounded-md border border-gf-border px-3 py-2 text-sm text-gf-text disabled:cursor-not-allowed disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gf-red/30"
              />
            </div>

            {/* Motivo */}
            <div>
              <label
                htmlFor="edit-reason"
                className="mb-1 block text-sm font-medium text-gf-text"
              >
                Motivo del cambio{" "}
                <span className="text-xs font-normal text-gf-text-muted">
                  (obligatorio, mínimo {MIN_REASON_LENGTH} caracteres)
                </span>
              </label>
              <textarea
                id="edit-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="Ej: Clasificado manualmente como revolvente por revisión del reporte de Buró..."
                className={`w-full rounded-md border px-3 py-2 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 ${
                  reasonError
                    ? "border-red-400"
                    : "border-gf-border"
                }`}
              />
              {reasonError && (
                <p className="mt-1 text-xs text-red-600">
                  El motivo debe tener al menos {MIN_REASON_LENGTH} caracteres.
                </p>
              )}
            </div>
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-3 border-t border-gf-border px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-gf-border bg-white px-5 py-2.5 text-sm font-semibold text-gf-text transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !reasonValid}
              className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Calculando..." : "Recalcular y guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}