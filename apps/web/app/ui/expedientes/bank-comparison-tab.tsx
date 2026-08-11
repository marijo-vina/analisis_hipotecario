"use client";

import { useState } from "react";
import type {
  BankViabilitySnapshot,
  BankResult,
  BankResultStatus,
} from "@/app/lib/definitions";
import { STATUS_LABELS, REASON_LABELS, DESTINATION_LABELS } from "@/app/lib/definitions";
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

const BANK_BRANDS: Record<string, { bg: string; text: string; initials: string }> = {
  SCOTIABANK: { bg: "#EC111A", text: "#FFFFFF", initials: "SCO" },
  BBVA: { bg: "#004481", text: "#FFFFFF", initials: "BBVA" },
  CITIBANAMEX: { bg: "#002D72", text: "#FFFFFF", initials: "BNMX" },
  BANORTE: { bg: "#EB1C24", text: "#FFFFFF", initials: "BTE" },
  SANTANDER: { bg: "#EC0000", text: "#FFFFFF", initials: "SAN" },
  HSBC: { bg: "#DB0011", text: "#FFFFFF", initials: "HSBC" },
  BANREGIO: { bg: "#FF6600", text: "#FFFFFF", initials: "BRG" },
  MIFEL: { bg: "#003B70", text: "#FFFFFF", initials: "MIF" },
};

function BankBadge({ code, name }: { code: string; name: string }) {
  const brand = BANK_BRANDS[code.toUpperCase()] ?? {
    bg: "#374151",
    text: "#FFFFFF",
    initials: name.substring(0, 3).toUpperCase(),
  };

  return (
    <span
      className="inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold tracking-tight shrink-0 shadow-sm"
      style={{ backgroundColor: brand.bg, color: brand.text }}
    >
      {brand.initials}
    </span>
  );
}

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
  return `$${num.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: string | null): string {
  if (value == null) return "—";
  const num = Number(String(value).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(num)) return value;
  return `${(num * 100).toFixed(0)}%`;
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

  const { destination, bankResults, reasons } = bankViability;

  // 2. Results — products exist
  if (bankResults.length > 0) {
    // Sort: by status order, then availableCapacity DESC (nulls last)
    const sorted = [...bankResults].sort((a, b) => {
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
          bankResults={bankResults}
          destination={destination}
          calculatedAt={bankViability.calculatedAt}
          sourceVersion={bankViability.sourceVersion}
        />
        <FinancialSummary inputs={bankViability.inputs} destination={bankViability.destination} />
        <ProductTable
          rows={sorted}
          expandedIndex={expandedIndex}
          onToggle={(i) => setExpandedIndex(expandedIndex === i ? null : i)}
          inputs={bankViability.inputs}
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
    <EmptyState message="Sin bancos activos para el destino y perfil" />
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
  bankResults,
  destination,
}: {
  bankResults: BankResult[];
  destination: string | null;
  calculatedAt?: string;
  sourceVersion?: string;
}) {
  const counts: Record<BankResultStatus, number> = {
    PRELIMINARY_VIABLE: 0,
    CONDITIONED: 0,
    REQUIRES_REVIEW: 0,
    NOT_COMPATIBLE: 0,
  };
  for (const m of bankResults) {
    counts[m.status]++;
  }

  const hasViable = counts.PRELIMINARY_VIABLE > 0;
  const total = bankResults.length;
  const destLabel = DESTINATION_LABELS[destination ?? ""] ?? destination ?? "—";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 rounded-md bg-emerald-50/80 border border-emerald-200/80 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-700 text-white text-[10px] font-bold shrink-0">
          ✓
        </span>
        <span className="font-semibold text-emerald-900">
          {hasViable ? "Evaluación con opciones viables" : "Sin bancos compatibles"}
        </span>
        <span className="text-gf-text-muted hidden sm:inline">•</span>
        <span className="text-gf-text-muted font-normal">
          {total} banco{total !== 1 ? "s" : ""} para {destLabel}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {(
          [
            ["PRELIMINARY_VIABLE", "#166534", "Viables"],
            ["CONDITIONED", "#92400E", "Condicionados"],
            ["REQUIRES_REVIEW", "#1D4ED8", "Revisión"],
            ["NOT_COMPATIBLE", "#991B1B", "No compatibles"],
          ] as const
        ).map(([status, color, label]) =>
          counts[status] > 0 ? (
            <span
              key={status}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white border border-gf-border/40 text-gf-text"
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span>{counts[status]} {label}</span>
            </span>
          ) : null,
        )}
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
    { label: "Valor inmueble", value: formatCurrency(inputs.propertyValue) },
    { label: "Plazo", value: termYears ?? "—" },
    { label: "Destino", value: DESTINATION_LABELS[destination ?? ""] ?? destination ?? "—" },
  ];

  return (
    <div
      className="flex items-stretch rounded-lg border border-gf-border/50 overflow-hidden"
      style={{ backgroundColor: "#F9FAFB" }}
    >
      {fields.map((f, i) => (
        <div
          key={f.label}
          className="flex-1 px-3 py-3 flex flex-col justify-center relative"
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
  inputs,
}: {
  rows: BankResult[];
  expandedIndex: number | null;
  onToggle: (index: number) => void;
  inputs?: BankViabilitySnapshot["inputs"];
}) {
  const columns: Column<BankResult>[] = [
    {
      key: "bankCode",
      header: "Banco",
      render: (m) => {
        const snap = m.policySnapshot as unknown as Record<string, unknown>;
        const name = (snap.bankName as string) || m.bankCode;
        const isExpanded = expandedIndex === rows.indexOf(m);
        return (
          <span className="inline-flex items-center gap-2">
            <span className="text-sm text-gf-text-muted" style={{ minWidth: "14px" }}>
              {isExpanded ? "▲" : "▼"}
            </span>
            <BankBadge code={m.bankCode} name={name} />
            <span className="text-xs font-semibold text-gf-text">{name}</span>
            <span className="text-[10px] text-gf-text-muted">
              {isExpanded ? "Ocultar" : "Ver detalle"}
            </span>
          </span>
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
      header: "Capacidad de pago",
      render: (m) => (
        <span className="text-xs font-bold text-emerald-700">
          {m.calculation.availableCapacity != null
            ? formatCurrency(m.calculation.availableCapacity)
            : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (m) => {
        const firstReason =
          m.reasons.length > 0 ? REASON_LABELS[m.reasons[0]] ?? m.reasons[0] : null;
        const showReason =
          (m.status === "REQUIRES_REVIEW" || m.status === "NOT_COMPATIBLE") &&
          firstReason;
        return (
          <div className="flex flex-col gap-0.5">
            <span
              className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap"
              style={{ backgroundColor: STATUS_BADGE_COLORS[m.status] ?? "#6B7280" }}
            >
              {STATUS_LABELS[m.status] ?? m.status}
            </span>
            {showReason && (
              <span className="text-[10px] text-gf-text-muted leading-tight">
                {firstReason}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-0">
      <DataTable<BankResult>
        columns={columns}
        rows={rows}
        emptyMessage="Sin bancos evaluados"
        onRowClick={(_, i) => onToggle(i)}
        selectedIndex={expandedIndex}
      />
      {/* Expanded detail panels — rendered below the table */}
      {expandedIndex != null && expandedIndex < rows.length && (
        <ProductDetail match={rows[expandedIndex]} inputs={inputs} />
      )}
    </div>
  );
}

// ── Product Detail (expandable) ──────────────────────────────────────────────

function ProductDetail({ match, inputs }: { match: BankResult; inputs?: BankViabilitySnapshot["inputs"] }) {
  const { calculation, checks, reasons, policySnapshot } = match;
  const snap = policySnapshot as unknown as Record<string, unknown>;
  const bankName = (snap.bankName as string) || match.bankCode;

  const criterion = policySnapshot.incomeCriterion;
  const isNet = String(criterion).toUpperCase().includes("NET");
  const incomeLabel = isNet ? "Neto" : "Bruto";
  const statusLabel = STATUS_LABELS[match.status] ?? match.status;
  const mainReason =
    reasons.length > 0 ? REASON_LABELS[reasons[0]] ?? reasons[0] : "Sin restricciones detectadas";

  const controlKeys = ["capacity", "minimumApplicantAge", "maximumApplicationAge", "employmentTenure", "minimumIncome", "minimumPropertyValue", "minimumBureauScore"] as const;
  const controlLabels: Record<string, string> = {
    capacity: "Capacidad de pago",
    minimumApplicantAge: "Edad mínima solicitante",
    maximumApplicationAge: "Edad máxima de solicitud",
    employmentTenure: "Antigüedad laboral",
    minimumIncome: "Ingreso mínimo",
    minimumPropertyValue: "Valor mínimo inmueble",
    minimumBureauScore: "Score mínimo de Buró",
  };
  const resultBadge: Record<string, { color: string; label: string }> = { PASS: { color: "#166534", label: "Cumple" }, FAIL: { color: "#991B1B", label: "No cumple" }, NOT_APPLICABLE: { color: "#6B7280", label: "No aplica" }, REQUIRES_REVIEW: { color: "#1D4ED8", label: "Requiere revisión" } };

  function getPolicyText(key: string): string {
    const minAge = snap.minimumApplicantAgeMonths as number | null | undefined;
    const maxAge = snap.maximumApplicationAgeMonths as number | null | undefined;
    const minTenure = snap.minimumEmploymentTenureMonths as number | null | undefined;
    const minInc = snap.minimumIncome as string | null | undefined;
    const minProp = snap.minimumPropertyValue as string | null | undefined;
    const minScore = snap.minimumBureauScore as number | null | undefined;
    switch (key) {
      case "capacity": return "Debe ser mayor que $0.00";
      case "minimumApplicantAge": return minAge ? `Mín. ${formatAge(minAge)}` : "—";
      case "maximumApplicationAge": return maxAge ? `Máx. ${formatAge(maxAge)}` : "—";
      case "employmentTenure": return minTenure ? `Mín. ${formatAge(minTenure)}` : "—";
      case "minimumIncome": return minInc ? `Mín. ${formatCurrency(minInc)}` : "—";
      case "minimumPropertyValue": return minProp ? `Mín. ${formatCurrency(minProp)}` : "—";
      case "minimumBureauScore": return minScore ? `Mín. ${minScore} pts` : "No especificado";
      default: return "—";
    }
  }

  function getExpedienteValue(key: string): string {
    switch (key) {
      case "capacity": return formatCurrency(calculation.availableCapacity);
      case "minimumApplicantAge": return formatAge(calculation.currentAgeMonths);
      case "maximumApplicationAge": return formatAge(calculation.currentAgeMonths);
      case "employmentTenure": return formatAge(calculation.employmentTenureMonths);
      case "minimumIncome": return formatCurrency(calculation.incomeUsed);
      case "minimumPropertyValue": return formatCurrency((match.checks?.minimumPropertyValue?.actual as string) ?? (inputs?.propertyValue ?? null));
      case "minimumBureauScore": {
        const actual = match.checks?.minimumBureauScore?.actual;
        return actual != null ? `${actual} pts` : "—";
      }
      default: return "—";
    }
  }

  const borderAccentColor = STATUS_BADGE_COLORS[match.status] ?? "#6B7280";

  return (
    <div className="border-t-0 rounded-b-lg" style={{ backgroundColor: "#F8F9FA", borderLeft: `4px solid ${borderAccentColor}` }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <BankBadge code={match.bankCode} name={bankName} />
          <span className="text-sm font-semibold text-gf-text truncate">{bankName}</span>
          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap" style={{ backgroundColor: STATUS_BADGE_COLORS[match.status] ?? "#6B7280" }}>{statusLabel}</span>
        </div>
        <span className="text-[11px] text-gf-text-muted">{mainReason}</span>
      </div>

      {/* Body — 2 cols: left (calc + controls), right (reasons) */}
      <div className="px-5 pb-4 space-y-4">
        {/* Top row: compact financial calc cards */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            ["Criterio", incomeLabel],
            ["Ingreso usado", formatCurrency(calculation.incomeUsed)],
            ["Factor CE", formatPercent(policySnapshot.debtCommitmentFactor)],
            ["Máx. deuda", formatCurrency(calculation.maximumDebt)],
            ["Pasivo mensual", formatCurrency(calculation.totalMonthlyLiabilities)],
            ["Cap. disponible", formatCurrency(calculation.availableCapacity)],
          ].map(([label, value]) => (
            <div key={label} className="bg-white rounded-md border border-gf-border/30 px-2.5 py-2">
              <div className="text-[9px] text-gf-text-muted uppercase leading-tight">{label}</div>
              <div className="text-xs font-semibold text-gf-text leading-tight mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        {/* Controls table */}
        <div className="overflow-x-auto rounded border border-gf-border/30">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gf-bg/40 border-b border-gf-border/20">
                <th className="text-left px-3 py-1.5 text-[10px] font-medium text-gf-text-muted uppercase">Control</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-medium text-gf-text-muted uppercase">Expediente</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-medium text-gf-text-muted uppercase">Política</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-medium text-gf-text-muted uppercase">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {controlKeys.map((key) => {
                const check = checks[key];
                const status = check?.status ?? "NOT_APPLICABLE";
                const expediente = status === "REQUIRES_REVIEW" ? "—" : getExpedienteValue(key);
                const badge = resultBadge[status] ?? { color: "#6B7280", label: status };
                return (
                  <tr key={key} className="border-b border-gf-border/10 last:border-b-0">
                    <td className="px-3 py-1.5 text-xs text-gf-text">{controlLabels[key]}</td>
                    <td className="px-3 py-1.5 text-xs text-gf-text">{expediente}</td>
                    <td className="px-3 py-1.5 text-xs text-gf-text-muted">{getPolicyText(key)}</td>
                    <td className="px-3 py-1.5">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold text-white" style={{ backgroundColor: badge.color }}>{badge.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Reasons — always shown */}
        <div className="text-xs text-gf-text-muted">
          <span className="font-medium text-gf-text">Razones: </span>
          {reasons.length === 0
            ? "Sin observaciones adicionales."
            : reasons.map((r) => REASON_LABELS[r] ?? r).join(" · ")}
        </div>

        {/* Suggested adjustments (CONDITIONED only) */}
        {match.status === "CONDITIONED" && <SuggestedAdjustments match={match} />}
      </div>
    </div>
  );
}

// ── Suggested Adjustments ────────────────────────────────────────────────────

function SuggestedAdjustments({ match }: { match: BankResult }) {
  const items: string[] = [];

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
