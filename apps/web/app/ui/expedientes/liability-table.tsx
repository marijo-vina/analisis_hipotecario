"use client";

import type { ReactNode } from "react";

import {
  GlobalLiabilityStatus,
  LiabilityCreditNature,
  LiabilityStatus,
  type LiabilityCalculationResult,
  type LiabilityCreditResult,
} from "@/app/lib/extraction";

import {
  formatMXN,
  GLOBAL_STATUS_LABELS,
  NATURE_LABELS,
  LIABILITY_STATUS_LABELS,
} from "./liability-calculation-section";

interface LiabilityTableProps {
  snapshot: LiabilityCalculationResult;
  /** Called when a REQUIRES_REVIEW / INCOMPLETE row is clicked. */
  onEditCredit: (creditIndex: number, credit: LiabilityCreditResult) => void;
}

// ── Sort ordering: Revolventes → Fijos → Pendientes ─────────────────────────

const NATURE_ORDER: Record<LiabilityCreditNature, number> = {
  [LiabilityCreditNature.REVOLVING]: 0,
  [LiabilityCreditNature.FIXED]: 1,
  [LiabilityCreditNature.UNKNOWN]: 2,
};

function sortByNature(credits: LiabilityCreditResult[]): {
  credits: LiabilityCreditResult[];
  /** indices in the *original* snapshot array, preserved for PATCH calls */
  originalIndices: number[];
} {
  // Filter out closed credits — only show active/open credits
  const open = credits
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.isClosed);
  open.sort(
    (a, b) => NATURE_ORDER[a.c.creditNature] - NATURE_ORDER[b.c.creditNature],
  );
  return {
    credits: open.map((x) => x.c),
    originalIndices: open.map((x) => x.i),
  };
}

// ── Style maps (exact colors from the UI spec) ──────────────────────────────

const NATURE_BADGE: Record<
  LiabilityCreditNature,
  { bg: string; text: string }
> = {
  [LiabilityCreditNature.REVOLVING]: { bg: "#DBEAFE", text: "#1E40AF" },
  [LiabilityCreditNature.FIXED]: { bg: "#F3E8FF", text: "#7C3AED" },
  [LiabilityCreditNature.UNKNOWN]: { bg: "#FEF3C7", text: "#92400E" },
};

const STATUS_BADGE: Record<LiabilityStatus, { bg: string; text: string }> = {
  [LiabilityStatus.CALCULATED]: { bg: "#D1FAE5", text: "#065F46" },
  [LiabilityStatus.REQUIRES_REVIEW]: { bg: "#FEF3C7", text: "#92400E" },
  [LiabilityStatus.INCOMPLETE]: { bg: "#FEE2E2", text: "#991B1B" },
};

// ── Component ─────────────────────────────────────────────────────────────

/**
 * LiabilityTable — credit breakdown table.
 *
 * Rows are ordered Revolventes → Fijos → Pendientes with a 2px separator
 * between groups. Rows with REQUIRES_REVIEW or INCOMPLETE are clickable and
 * open the edit modal. Footer shows the two aggregate totals.
 */
export default function LiabilityTable({
  snapshot,
  onEditCredit,
}: LiabilityTableProps) {
  const { credits: ordered, originalIndices } = sortByNature(
    snapshot.credits,
  );

  // ── Build rows, inserting a separator whenever the nature group changes ──
  const rows: ReactNode[] = [];
  let prevNature: LiabilityCreditNature | null = null;
  ordered.forEach((credit, displayIdx) => {
    if (
      prevNature !== null &&
      credit.creditNature !== prevNature
    ) {
      rows.push(
        <tr key={`sep-${displayIdx}`}>
          <td
            colSpan={8}
            className="border-b-2 bg-gray-100 p-0"
            style={{ height: 2 }}
          />
        </tr>,
      );
    }
    prevNature = credit.creditNature;
    const creditIndex = originalIndices[displayIdx];
    rows.push(
      <CreditRow
        key={`${credit.creditReference}-${displayIdx}`}
        credit={credit}
        clickable={
          credit.liabilityStatus === LiabilityStatus.REQUIRES_REVIEW ||
          credit.liabilityStatus === LiabilityStatus.INCOMPLETE
        }
        onClick={() => onEditCredit(creditIndex, credit)}
      />,
    );
  });

  const status = snapshot.globalStatus;
  const globalBadge = STATUS_BADGE[
    status === GlobalLiabilityStatus.INCOMPLETE
      ? LiabilityStatus.INCOMPLETE
      : status === GlobalLiabilityStatus.PARTIAL
        ? LiabilityStatus.REQUIRES_REVIEW
        : LiabilityStatus.CALCULATED
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <thead>
          <tr style={{ backgroundColor: "#F3F4F6" }}>
            {[
              "Crédito reportado",
              "Institución",
              "Naturaleza",
              "Saldo actual",
              "Monto a considerar",
              "Monto a pagar",
              "Pasivo calculado",
              "Estado",
            ].map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left text-[11px] font-semibold"
                style={{ color: "#4B5563" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <tbody>{rows}</tbody>

        {/* ── Footer totals ────────────────────────────────────────────── */}
        <tfoot>
          <tr>
            <td colSpan={8} className="p-0">
              <div className="flex gap-3 px-3 py-3" style={{ backgroundColor: "#F9FAFB" }}>
                {/* Card: Saldo actual total */}
                <div className="flex flex-1 items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5">
                  <span className="text-xs font-semibold text-gf-text-muted">
                    Saldo actual total
                  </span>
                  <span className="text-sm font-bold text-gf-text">
                    {formatMXN(snapshot.totalCurrentBalance)}
                  </span>
                </div>

                {/* Divider pipe */}
                <div className="w-px bg-gray-200" />

                {/* Card: Deuda total mensual */}
                <div className="flex flex-1 items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5">
                  <span className="text-xs font-semibold text-gf-text-muted">
                    Deuda total mensual
                  </span>
                  <span className="inline-flex items-center gap-2">
                    {status !== GlobalLiabilityStatus.CALCULATED && (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: globalBadge.bg,
                          color: globalBadge.text,
                        }}
                      >
                        {GLOBAL_STATUS_LABELS[status]}
                      </span>
                    )}
                    <span className="text-sm font-bold text-gf-text">
                      {formatMXN(snapshot.grossCurrentMonthlyDebt)}
                    </span>
                  </span>
                </div>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Row (inline) ───────────────────────────────────────────────────────────

function CreditRow({
  credit,
  clickable,
  onClick,
}: {
  credit: LiabilityCreditResult;
  clickable: boolean;
  onClick: () => void;
}) {
  const nature = credit.creditNature;
  const natureBadge = NATURE_BADGE[nature];
  const statusBadge = STATUS_BADGE[credit.liabilityStatus];

  // ── "Monto a considerar" column logic ──────────────────────────────────
  let montoConsiderar: ReactNode;
  if (nature === LiabilityCreditNature.REVOLVING) {
    const rev = credit.currentBalance !== null
      ? credit.currentBalance * 0.06
      : null;
    montoConsiderar = (
      <span>
        {formatMXN(rev)}{" "}
        <span className="text-[10px] text-gf-text-soft">
          (6% del saldo)
        </span>
      </span>
    );
  } else if (nature === LiabilityCreditNature.FIXED) {
    montoConsiderar = (
      <span className="text-gf-text-soft">— No aplica</span>
    );
  } else {
    // UNKNOWN / provisional
    montoConsiderar = (
      <span>
        {formatMXN(credit.currentBalance)}{" "}
        <span className="text-[10px]" style={{ color: "#92400E" }}>
          (cálculo provisional)
        </span>
      </span>
    );
  }

  // ── "Pasivo calculado" color ────────────────────────────────────────────
  const pasivoColor =
    nature === LiabilityCreditNature.UNKNOWN ? "#D97706" : "#1F2937";

  const rowBase =
    "border-t border-gray-100 align-top transition-colors " +
    (clickable
      ? "cursor-pointer hover:bg-amber-50"
      : "cursor-default");

  return (
    <tr
      className={rowBase}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <td className="px-3 py-2 text-gf-text">
        {credit.creditType || credit.creditReference || "—"}
      </td>
      <td className="px-3 py-2 text-gf-text">{credit.institution || "—"}</td>
      <td className="px-3 py-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: natureBadge.bg,
            color: natureBadge.text,
          }}
        >
          {NATURE_LABELS[nature]}
        </span>
      </td>
      <td className="px-3 py-2 text-gf-text">
        {formatMXN(credit.currentBalance)}
      </td>
      <td className="px-3 py-2 text-gf-text">{montoConsiderar}</td>
      <td className="px-3 py-2 text-gf-text">
        {formatMXN(credit.paymentDueAmountEffective)}
      </td>
      <td className="px-3 py-2 font-bold" style={{ color: pasivoColor }}>
        {formatMXN(credit.monthlyDebtContribution)}
      </td>
      <td className="px-3 py-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: statusBadge.bg,
            color: statusBadge.text,
          }}
        >
          {LIABILITY_STATUS_LABELS[credit.liabilityStatus]}
        </span>
      </td>
    </tr>
  );
}