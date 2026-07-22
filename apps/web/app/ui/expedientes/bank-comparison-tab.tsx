"use client";

import { useState } from "react";
import type {
  BankViabilitySnapshot,
  ProductMatch,
  ProductMatchStatus,
} from "@/app/lib/definitions";
import { STATUS_LABELS, REASON_LABELS } from "@/app/lib/definitions";
import DataTable, { type Column } from "@/app/ui/common/data-table";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert months to human-readable age string.
 * 360 → "30 años", 365 → "30 años 5 meses", 12 → "1 año", 0 → "0 meses"
 */
export function formatAge(months: number | null): string {
  if (months == null) return "—";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
  if (rem > 0) parts.push(`${rem} ${rem === 1 ? "mes" : "meses"}`);
  return parts.join(" ") || "0 meses";
}

const STATUS_ORDER: Record<string, number> = {
  PRELIMINARY_VIABLE: 0,
  CONDITIONED: 1,
  REQUIRES_REVIEW: 2,
  NOT_COMPATIBLE: 3,
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  PRELIMINARY_VIABLE: "#166534",
  CONDITIONED: "#92400E",
  REQUIRES_REVIEW: "#1D4ED8",
  NOT_COMPATIBLE: "#991B1B",
};

const INSUFFICIENT_REASONS = new Set([
  "MISSING_INCOME_CALCULATION",
  "MISSING_LIABILITY_SNAPSHOT",
  "INVALID_PROPERTY_VALUE",
  "INVALID_REQUESTED_AMOUNT",
]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(value: string | null): string {
  if (value == null) return "—";
  const num = Number(String(value).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(num)) return value;
  return `$${num.toLocaleString("es-MX")}`;
}

function formatPercent(value: string | null): string {
  if (value == null) return "—";
  const num = Number(String(value).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(num)) return value;
  return `${num}%`;
}

function isInsufficientReasons(reasons: string[]): boolean {
  return reasons.some((r) => INSUFFICIENT_REASONS.has(r));
}

// ── Main Component ───────────────────────────────────────────────────────────

interface BankComparisonTabProps {
  bankViability?: BankViabilitySnapshot;
}

export default function BankComparisonTab({
  bankViability,
}: BankComparisonTabProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // ── Derive UI state ──────────────────────────────────────────────────────

  // 1. Empty — no analysis
  if (bankViability == null) {
    return (
      <EmptyState message="Sin comparativa bancaria" />
    );
  }

  const { destination, productMatches, reasons } = bankViability;

  // 2. Results — products exist
  if (productMatches.length > 0) {
    // Sort: by status order, then availableCapacity DESC (nulls last)
    const sorted = [...productMatches].sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 99;
      const sb = STATUS_ORDER[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      const ca = a.calculation.availableCapacity;
      const cb = b.calculation.availableCapacity;
      if (ca == null && cb == null) return 0;
      if (ca == null) return 1;
      if (cb == null) return -1;
      return Number(cb) - Number(ca);
    });

    return (
      <div className="space-y-4">
        <StatusHeader
          productMatches={productMatches}
          destination={destination}
          calculatedAt={bankViability.calculatedAt}
          sourceVersion={bankViability.sourceVersion}
        />
        <FinancialSummary inputs={bankViability.inputs} destination={bankViability.destination} />
        <ProductTable
          rows={sorted}
          expandedIndex={expandedIndex}
          onToggle={(i) => setExpandedIndex(expandedIndex === i ? null : i)}
        />
        <WarningLegend legend={bankViability.warningLegend} />
      </div>
    );
  }

  // 3. Unsupported — no destination
  if (destination == null) {
    return (
      <EmptyState message="Destino no incluido en la evaluación del MVP" />
    );
  }

  // 4. Insufficient data — empty matches + specific missing-data reasons
  if (isInsufficientReasons(reasons)) {
    return (
      <EmptyState message="Faltan datos para la evaluación" />
    );
  }

  // 5. No products — supported destination but no matches
  return (
    <EmptyState message="Sin productos activos para el destino y perfil" />
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm text-gf-text-muted">{message}</p>
    </div>
  );
}

// ── Status Header ────────────────────────────────────────────────────────────

function StatusHeader({
  productMatches,
  destination,
  calculatedAt,
  sourceVersion,
}: {
  productMatches: ProductMatch[];
  destination: string | null;
  calculatedAt: string;
  sourceVersion: string;
}) {
  const counts: Record<ProductMatchStatus, number> = {
    PRELIMINARY_VIABLE: 0,
    CONDITIONED: 0,
    REQUIRES_REVIEW: 0,
    NOT_COMPATIBLE: 0,
  };
  for (const m of productMatches) {
    counts[m.status]++;
  }

  const hasViable = counts.PRELIMINARY_VIABLE > 0;
  const total = productMatches.length;
  const destLabel = destination ?? "—";

  return (
    <div
      className="flex items-center justify-between px-5 py-4 rounded-lg border"
      style={{ backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }}
    >
      {/* Left */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center w-5 h-5 rounded-full text-white text-[11px] font-bold"
            style={{ backgroundColor: "#166534" }}
          >
            ✓
          </span>
          <span className="text-sm font-semibold text-gf-text">
            {hasViable
              ? "Evaluación con opciones viables"
              : "Sin productos compatibles"}
          </span>
        </div>
        <p className="text-xs text-gf-text-muted">
          {total} producto{total !== 1 ? "s" : ""} evaluado
          {total !== 1 ? "s" : ""} para {destLabel}
        </p>
        <div className="flex items-center gap-3 pt-1">
          {(
            [
              ["PRELIMINARY_VIABLE", "#166534"],
              ["CONDITIONED", "#92400E"],
              ["REQUIRES_REVIEW", "#1D4ED8"],
              ["NOT_COMPATIBLE", "#991B1B"],
            ] as const
          ).map(([status, color]) =>
            counts[status] > 0 ? (
              <span key={status} className="inline-flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[11px] text-gf-text-muted">
                  {counts[status]}
                </span>
              </span>
            ) : null,
          )}
        </div>
      </div>

      {/* Right */}
      <div className="text-right space-y-0.5">
        <p className="text-[11px] text-gf-text-muted">
          Analizado {formatDate(calculatedAt)}
        </p>
        <p className="text-[11px] text-gf-text-muted">
          Anaquel {sourceVersion}
        </p>
      </div>
    </div>
  );
}

// ── Financial Summary ────────────────────────────────────────────────────────

function FinancialSummary({
  inputs,
  destination,
}: {
  inputs: BankViabilitySnapshot["inputs"];
  destination: string | null;
}) {
  const termYears =
    inputs.estimatedTermMonths != null
      ? `${Math.round(inputs.estimatedTermMonths / 12)} años`
      : null;

  const fields = [
    { label: "Ingreso bruto", value: formatCurrency(inputs.confirmedGrossIncome) },
    { label: "Ingreso neto", value: formatCurrency(inputs.confirmedNetIncome) },
    { label: "Pasivo mensual", value: formatCurrency(inputs.totalMonthlyLiabilities) },
    { label: "Monto solicitado", value: formatCurrency(inputs.requestedAmount) },
    { label: "Valor inmueble", value: formatCurrency(inputs.propertyValue) },
    { label: "Plazo", value: termYears ?? "—" },
    { label: "Destino", value: destination ?? "—" },
  ];

  return (
    <div
      className="flex items-stretch rounded-lg border border-gf-border/50 overflow-hidden"
      style={{ backgroundColor: "#F9FAFB" }}
    >
      {fields.map((f, i) => (
        <div
          key={f.label}
          className="flex-1 px-3 py-3 flex flex-col justify-center"
        >
          {i > 0 && (
            <div className="absolute left-0 top-2 bottom-2 w-px bg-gf-border/40" />
          )}
          <span className="text-[10px] text-gf-text-muted mb-0.5">
            {f.label}
          </span>
          <span className="text-sm font-semibold text-gf-text truncate">
            {f.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Product Table ────────────────────────────────────────────────────────────

function ProductTable({
  rows,
  expandedIndex,
  onToggle,
}: {
  rows: ProductMatch[];
  expandedIndex: number | null;
  onToggle: (index: number) => void;
}) {
  const columns: Column<ProductMatch>[] = [
    {
      key: "bankCode",
      header: "Banco",
      render: (m) => {
        // Fallback: check if policySnapshot has bankName (not in typed interface)
        const snap = m.policySnapshot as unknown as Record<string, unknown>;
        const name = (snap.bankName as string) || m.bankCode;
        const isExpanded = expandedIndex === rows.indexOf(m);
        return (
          <span className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(rows.indexOf(m));
              }}
              className="text-gf-text-muted hover:text-gf-text transition-transform text-[10px]"
              style={{
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              ▸
            </button>
            <span className="text-xs font-medium text-gf-text">{name}</span>
          </span>
        );
      },
    },
    {
      key: "productCode",
      header: "Producto",
      render: (m) => {
        const snap = m.policySnapshot as unknown as Record<string, unknown>;
        const name = (snap.productName as string) || m.productCode;
        return (
          <span className="text-xs text-gf-text">{name}</span>
        );
      },
    },
    {
      key: "income",
      header: "Ingreso",
      render: (m) => {
        const criterion = m.policySnapshot.incomeCriterion;
        const isNet = String(criterion).toUpperCase().includes("NET");
        const label = isNet ? "Neto" : "Bruto";
        return (
          <span className="text-xs text-gf-text">
            {label} · {formatCurrency(m.calculation.incomeUsed)}
          </span>
        );
      },
    },
    {
      key: "ce",
      header: "CE",
      render: (m) => (
        <span className="text-xs text-gf-text">
          {formatPercent(m.policySnapshot.debtCommitmentFactor)}
        </span>
      ),
    },
    {
      key: "maxDebt",
      header: "Máx. endeud.",
      render: (m) => (
        <span className="text-xs text-gf-text">
          {formatCurrency(m.calculation.maximumDebt)}
        </span>
      ),
    },
    {
      key: "capacity",
      header: "Cap. disponible",
      render: (m) => (
        <span className="text-xs text-gf-text">
          {m.calculation.availableCapacity != null
            ? formatCurrency(m.calculation.availableCapacity)
            : "—"}
        </span>
      ),
    },
    {
      key: "aforo",
      header: "Aforo",
      render: (m) => {
        const hasLtvExceeded = m.reasons.includes("LTV_EXCEEDED");
        if (hasLtvExceeded) {
          const requested = formatPercent(m.calculation.requestedLtv);
          const maxLtv = formatPercent(m.policySnapshot.maximumLtv);
          return (
            <span className="text-xs text-gf-text">
              {requested} / máx. {maxLtv}
            </span>
          );
        }
        return (
          <span className="text-xs text-gf-text">
            {formatPercent(m.calculation.requestedLtv)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Estado",
      render: (m) => (
        <span
          className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap"
          style={{ backgroundColor: STATUS_BADGE_COLORS[m.status] ?? "#6B7280" }}
        >
          {STATUS_LABELS[m.status] ?? m.status}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-0">
      <DataTable<ProductMatch>
        columns={columns}
        rows={rows}
        emptyMessage="Sin productos evaluados"
      />
      {/* Expanded detail panels — rendered below the table */}
      {expandedIndex != null && expandedIndex < rows.length && (
        <ProductDetail match={rows[expandedIndex]} />
      )}
    </div>
  );
}

// ── Product Detail (expandable) ──────────────────────────────────────────────

function ProductDetail({ match }: { match: ProductMatch }) {
  const { calculation, checks, reasons } = match;

  // Determine income type label
  const criterion = match.policySnapshot.incomeCriterion;
  const isNet = String(criterion).toUpperCase().includes("NET");
  const incomeLabel = isNet ? "Neto" : "Bruto";

  // 6 control rows (BankViabilityRule produces exactly 6 checks)
  const controlRows: {
    label: string;
    expediente: string;
    politica: string;
    status: string;
  }[] = [
    {
      label: "Capacidad de pago",
      expediente: formatCurrency(calculation.availableCapacity),
      politica: formatCurrency(calculation.maximumDebt),
      status: checks.capacity?.status ?? "NOT_APPLICABLE",
    },
    {
      label: "Aforo",
      expediente: formatPercent(calculation.requestedLtv),
      politica: formatPercent(match.policySnapshot.maximumLtv),
      status: checks.ltv?.status ?? "NOT_APPLICABLE",
    },
    {
      label: "Edad mínima solicitante",
      expediente: formatAge(calculation.currentAgeMonths),
      politica: formatAge(match.policySnapshot.minimumApplicantAgeMonths),
      status: checks.minimumApplicantAge?.status ?? "NOT_APPLICABLE",
    },
    {
      label: "Edad máxima de solicitud",
      expediente: formatAge(calculation.currentAgeMonths),
      politica: formatAge(match.policySnapshot.maximumApplicationAgeMonths),
      status: checks.maximumApplicationAge?.status ?? "NOT_APPLICABLE",
    },
    {
      label: "Edad al vencimiento",
      expediente: formatAge(calculation.ageAtMaturityMonths),
      politica: formatAge(match.policySnapshot.maximumMaturityAgeMonths),
      status: checks.maturityAge?.status ?? "NOT_APPLICABLE",
    },
    {
      label: "Antigüedad laboral",
      expediente: formatAge(calculation.employmentTenureMonths),
      politica: formatAge(match.policySnapshot.minimumEmploymentTenureMonths),
      status: checks.employmentTenure?.status ?? "NOT_APPLICABLE",
    },
  ];

  const resultBadgeColor: Record<string, string> = {
    PASS: "#166534",
    FAIL: "#991B1B",
    NOT_APPLICABLE: "#6B7280",
    REQUIRES_REVIEW: "#1D4ED8",
  };

  const resultBadgeLabel: Record<string, string> = {
    PASS: "Cumple",
    FAIL: "No cumple",
    NOT_APPLICABLE: "No aplica",
    REQUIRES_REVIEW: "Requiere revisión",
  };

  return (
    <div
      className="border border-gf-border/50 rounded-b-lg -mt-px"
      style={{ backgroundColor: "#FAFAFA" }}
    >
      <div className="p-5 space-y-5">
        {/* 1. Cálculo financiero */}
        <section>
          <h4 className="text-xs font-semibold text-gf-text mb-2">
            Cálculo financiero
          </h4>
          <table className="w-full text-sm border-collapse max-w-md">
            <thead>
              <tr className="border-b border-gf-border/40">
                <th className="text-left px-3 py-1.5 text-[10px] font-medium text-gf-text-muted uppercase">
                  Concepto
                </th>
                <th className="text-left px-3 py-1.5 text-[10px] font-medium text-gf-text-muted uppercase">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Criterio de ingreso", incomeLabel],
                ["Ingreso utilizado", formatCurrency(calculation.incomeUsed)],
                ["Factor CE", formatPercent(match.policySnapshot.debtCommitmentFactor)],
                ["Máximo de endeudamiento", formatCurrency(calculation.maximumDebt)],
                ["Pasivo mensual", formatCurrency(calculation.totalMonthlyLiabilities)],
                ["Capacidad disponible", formatCurrency(calculation.availableCapacity)],
              ].map(([label, value]) => (
                <tr key={label} className="border-b border-gf-border/20">
                  <td className="px-3 py-1.5 text-xs text-gf-text-muted">{label}</td>
                  <td className="px-3 py-1.5 text-xs font-medium text-gf-text">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 2. Evaluación de controles */}
        <section>
          <h4 className="text-xs font-semibold text-gf-text mb-2">
            Evaluación de controles
          </h4>
          <div className="overflow-x-auto rounded border border-gf-border/40">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gf-bg/50 border-b border-gf-border/40">
                  <th className="text-left px-3 py-2 text-[10px] font-medium text-gf-text-muted uppercase">
                    Control
                  </th>
                  <th className="text-left px-3 py-2 text-[10px] font-medium text-gf-text-muted uppercase">
                    Expediente
                  </th>
                  <th className="text-left px-3 py-2 text-[10px] font-medium text-gf-text-muted uppercase">
                    Política
                  </th>
                  <th className="text-left px-3 py-2 text-[10px] font-medium text-gf-text-muted uppercase">
                    Resultado
                  </th>
                </tr>
              </thead>
              <tbody>
                {controlRows.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-gf-border/20 last:border-b-0"
                  >
                    <td className="px-3 py-2 text-xs text-gf-text">
                      {row.label}
                    </td>
                    <td className="px-3 py-2 text-xs text-gf-text">
                      {row.expediente}
                    </td>
                    <td className="px-3 py-2 text-xs text-gf-text-muted">
                      {row.politica}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                        style={{
                          backgroundColor:
                            resultBadgeColor[row.status] ?? "#6B7280",
                        }}
                      >
                        {resultBadgeLabel[row.status] ?? row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3. Razones */}
        {reasons.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold text-gf-text mb-2">
              Razones
            </h4>
            <ul className="list-disc list-inside space-y-0.5">
              {reasons.map((r) => (
                <li key={r} className="text-xs text-gf-text-muted">
                  {REASON_LABELS[r] ?? r}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 4. Ajustes sugeridos (CONDITIONED only) */}
        {match.status === "CONDITIONED" && (
          <SuggestedAdjustments match={match} />
        )}
      </div>
    </div>
  );
}

// ── Suggested Adjustments ────────────────────────────────────────────────────

function SuggestedAdjustments({ match }: { match: ProductMatch }) {
  const { calculation, reasons } = match;
  const items: string[] = [];

  if (
    reasons.includes("LTV_EXCEEDED") &&
    calculation.maximumAmountByLtv != null
  ) {
    const max = formatCurrency(calculation.maximumAmountByLtv);
    const reduction = formatCurrency(calculation.requiredReduction);
    items.push(
      `Monto máximo por aforo: ${max}. Reducción requerida: ${reduction}`,
    );
  }

  if (
    reasons.includes("MATURITY_AGE_EXCEEDED") &&
    calculation.maximumTheoreticalTermMonths != null
  ) {
    const termLabel = formatAge(calculation.maximumTheoreticalTermMonths);
    items.push(`Plazo máximo teórico: ${termLabel}`);
  }

  if (items.length === 0) return null;

  return (
    <section>
      <h4 className="text-xs font-semibold text-gf-text mb-2">
        Ajustes sugeridos
      </h4>
      <ul className="list-disc list-inside space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-gf-text-muted">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Warning Legend ───────────────────────────────────────────────────────────

function WarningLegend({ legend }: { legend: string }) {
  if (!legend) return null;

  return (
    <div
      className="flex items-start gap-2.5 px-4 py-3 rounded-lg border"
      style={{ backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }}
    >
      <span className="text-sm mt-px">⚠</span>
      <p className="text-xs text-gf-text leading-relaxed">{legend}</p>
    </div>
  );
}
