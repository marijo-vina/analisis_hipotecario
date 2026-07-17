"use client";

import { useState } from "react";
import type { ParsedBankStatement } from "@/app/lib/extraction";
import { formatDateDisplay } from "@/app/lib/extraction";
import Card from "@/app/ui/common/card";

interface EstadosStatementCardProps {
  statement: ParsedBankStatement;
}

/**
 * Expandable card for a single bank statement.
 *
 * Collapsed: bank icon + name, period, balance chip, alert badges, expand icon.
 * Expanded: + account details, deposit rows, inline alerts.
 *
 * Critical alerts get a red left-border accent.
 */
export default function EstadosStatementCard({
  statement,
}: EstadosStatementCardProps) {
  // Filter out per-statement month-count warnings; they're misleading
  // because each statement sees only itself, not the aggregate.
  const visibleAlerts = statement.alerts.filter(
    (a) => a.code !== "BANK_FEWER_MONTHS_THAN_REQUIRED",
  );
  const visibleHasCritical = visibleAlerts.some(
    (a) => a.severity === "CRITICAL",
  );

  const [expanded, setExpanded] = useState(visibleHasCritical);

  const borderClass = visibleHasCritical
    ? "border-l-4 border-l-red-500"
    : visibleAlerts.length > 0
      ? "border-l-4 border-l-amber-500"
      : "";

  const bankInitial = statement.bankName?.charAt(0).toUpperCase() ?? "?";

  // Bank color (approximate mapping for visual distinction)
  const bankColors: Record<string, string> = {
    BBVA: "bg-[#004481]",
    Santander: "bg-[#EC0000]",
    Banorte: "bg-[#D92534]",
    HSBC: "bg-[#DB0011]",
    Citibanamex: "bg-[#003B71]",
    Scotiabank: "bg-[#EE3124]",
    Azteca: "bg-[#1A1A1A]",
    Inbursa: "bg-[#003C71]",
  };
  const bankBg =
    bankColors[statement.bankName ?? ""] ?? "bg-gf-red";

  const periodLabel =
    statement.periodStart && statement.periodEnd
      ? `${fmtShort(statement.periodStart)} — ${fmtShort(statement.periodEnd)}`
      : statement.periodStart
        ? fmtShort(statement.periodStart)
        : "Sin periodo";

  const balanceIsNegative =
    statement.endingBalance != null && statement.endingBalance < 0;

  /**
   * Determine if the month is truly closed.
   * Uses backend flag first; falls back to date check (periodEnd in the past).
   */
  const isMonthClosed = statement.isClosedMonth ||
    (statement.periodEnd != null && new Date(statement.periodEnd) < new Date());

  const isError =
    statement.statusCode === "ERROR" ||
    statement.statusCode === "EXTRACTION_ERROR";
  const isPending =
    statement.statusCode === "UPLOADED" ||
    statement.statusCode === "PROCESSING";

  // ── Non-data state: show filename + status badge ─────────────────────
  if (!statement.hasData) {
    const statusBadgeClass = isError
      ? "bg-red-50 text-red-700"
      : isPending
        ? "bg-gray-100 text-gray-600"
        : "bg-gray-100 text-gray-600";

    return (
      <Card className={`overflow-hidden border-l-4 ${isError ? "border-l-red-400" : "border-l-gray-300"}`}>
        <div className="flex w-full items-center gap-3 px-5 py-4">
          {/* File icon */}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-sm text-gray-500">
            📄
          </span>

          {/* Filename + status */}
          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-gf-text truncate">
              {statement.originalName}
            </span>
            <span className="text-xs text-gf-text-muted">
              {statement.statusName}
            </span>
          </div>

          {/* Status badge */}
          <span className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass}`}>
            {isError ? "⚠ Error" : isPending ? "⏳ Pendiente" : statement.statusName}
          </span>
        </div>

        {isError && (
          <div className="border-t border-gf-border px-5 py-3 bg-red-50/50">
            <p className="text-xs text-red-700">
              La extracción de datos falló. Usá &quot;Reintentar extracción&quot; en el explorador de documentos para volver a intentarlo.
            </p>
          </div>
        )}
      </Card>
    );
  }

  // ── Data state: normal expandable card ───────────────────────────────

  return (
    <Card className={`overflow-hidden ${borderClass}`}>
      {/* ── Header row (always visible) ──────────────────────────────── */}
      <button
        type="button"
        className="flex w-full items-center gap-3.5 px-5 py-4 text-left hover:bg-gf-bg/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {/* Bank icon */}
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bankBg} text-base font-bold text-white`}
        >
          {bankInitial}
        </span>

        {/* Bank name + subtitle */}
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-gf-text">
              {statement.originalName ?? statement.bankName ?? "Desconocido"}
            </span>
            {visibleHasCritical && (
              <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                ● CRÍTICA
              </span>
            )}
            {!visibleHasCritical && visibleAlerts.length > 0 && (
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                ● ADVERTENCIA
              </span>
            )}
          </div>
        </div>

        {/* Deposit count + period badge */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {statement.deposits.length > 0 && (
            <span className="rounded-md bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-600">
              {statement.deposits.length} dép.
            </span>
          )}
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              isMonthClosed
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {periodLabel}
            {" · "}
            {isMonthClosed ? "Cerrado" : "En curso"}
          </span>
        </div>

        {/* Expand icon */}
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-sm text-gf-text-muted transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {/* ── Expanded detail ──────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-gf-border">
          {/* ── Key Metrics Row ──────────────────────────────────────── */}
          <div className="grid grid-cols-4 divide-x divide-gf-border px-5 py-5">
            <MetricCell
              label="Saldo promedio"
              value={
                statement.averageBalance != null
                  ? fmtCurrency(statement.averageBalance)
                  : "—"
              }
              sub="MXN"
            />
            <MetricCell
              label="Saldo final"
              value={
                statement.endingBalance != null
                  ? fmtCurrency(statement.endingBalance)
                  : "—"
              }
              sub="MXN"
              danger={balanceIsNegative}
            />
            <MetricCell
              label="Depósitos nómina"
              value={String(statement.deposits.length)}
              sub="detectados"
              accent={statement.deposits.length > 0}
            />
            <MetricCell
              label="Alertas"
              value={String(visibleAlerts.length)}
              sub={
                visibleHasCritical
                  ? "críticas"
                  : visibleAlerts.length > 0
                    ? "advertencias"
                    : "sin alertas"
              }
              danger={visibleHasCritical}
              warning={!visibleHasCritical && visibleAlerts.length > 0}
            />
          </div>

          <div className="border-t border-gf-border" />

          {/* ── Account Details ────────────────────────────────────────── */}
          <div className="space-y-4 px-5 py-5">
            <h4 className="text-[13px] font-semibold text-gf-text">
              Datos de la cuenta
            </h4>
            <div className="grid grid-cols-5 gap-6">
              <FieldCell label="Titular">
                {statement.accountHolder ?? "—"}
              </FieldCell>
              <FieldCell label="RFC" mono>
                {statement.accountHolderRfc ?? "—"}
              </FieldCell>
              <FieldCell label="No. de cuenta" mono>
                {statement.accountNumber
                  ? `**** ${statement.accountNumber}`
                  : "—"}
              </FieldCell>
              <FieldCell label="CLABE" mono>
                {statement.clabe ? maskClabe(statement.clabe) : "—"}
              </FieldCell>
              <FieldCell label="Tipo de cuenta">
                {statement.isJointAccount != null ? (
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${
                      statement.isJointAccount
                        ? "bg-amber-50 text-amber-700"
                        : "bg-green-50 text-green-700"
                    }`}
                  >
                    {statement.isJointAccount ? "Mancomunada" : "Individual"}
                  </span>
                ) : (
                  "—"
                )}
              </FieldCell>
            </div>
            <div className="grid grid-cols-3 gap-6">
              <FieldCell label="Periodo">
                {periodLabel}
              </FieldCell>
              <FieldCell label="Fecha de corte">
                {statement.cutoffDate
                  ? fmtShort(statement.cutoffDate)
                  : "—"}
              </FieldCell>
              <FieldCell label="Estado del mes">
                <span
                  className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${
                    isMonthClosed
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {isMonthClosed ? "Mes cerrado" : "En curso"}
                </span>
              </FieldCell>
            </div>
          </div>

          {/* ── Payroll deposits ──────────────────────────────────────── */}
          {statement.deposits.length > 0 && (
            <>
              <div className="border-t border-gf-border" />
              <div className="space-y-3 px-5 py-5">
                <div className="flex items-center gap-2.5">
                  <h4 className="text-[13px] font-semibold text-gf-text">
                    Depósitos de nómina detectados
                  </h4>
                  <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-600">
                    {statement.deposits.length} encontrados
                  </span>
                </div>
                <div className="space-y-2">
                  {statement.deposits.map((dep, i) => {
                    const dateParts = dep.date
                      ? parseDateParts(dep.date)
                      : null;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-4 rounded-xl bg-gf-bg px-4 py-3.5"
                      >
                        {/* Date block */}
                        <div className="flex w-[72px] shrink-0 flex-col items-center gap-0.5">
                          <span className="text-[11px] font-medium text-gf-red">
                            {dateParts?.monthAbbr ?? "—"}
                          </span>
                          <span className="text-lg font-bold leading-none text-gf-text">
                            {dateParts?.day ?? "—"}
                          </span>
                          <span className="text-[10px] text-gf-text-muted">
                            {dateParts?.year ?? "—"}
                          </span>
                        </div>

                        {/* Divider */}
                        <div className="h-12 w-px bg-gf-border" />

                        {/* Info */}
                        <div className="flex flex-1 flex-col gap-1 min-w-0">
                          <span className="text-[15px] font-bold text-green-600">
                            {dep.amount != null
                              ? `${fmtCurrency(dep.amount)} MXN`
                              : "—"}
                          </span>
                          <span className="text-[13px] font-semibold text-gf-text truncate">
                            {dep.employerName ?? dep.originalConcept ?? "—"}
                          </span>
                          <span className="text-xs text-gf-text-muted">
                            {dep.employerRfc && `RFC: ${dep.employerRfc}`}
                            {dep.employerRfc && dep.originalConcept && " · "}
                            {dep.originalConcept &&
                              `Concepto: ${dep.originalConcept}`}
                          </span>
                        </div>

                        {/* Match badge */}
                        <div className="shrink-0">
                          {dep.matchCandidateForPayroll && (
                            <span className="rounded-md bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-600">
                              ✓ Coincide con recibo de nómina
                            </span>
                          )}
                          {dep.isPayrollConcept &&
                            !dep.matchCandidateForPayroll && (
                              <span className="rounded-md bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-600">
                                ✓ Concepto nómina
                              </span>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── Alerts (excluding month-count warnings) ────────────────── */}
          {visibleAlerts.length > 0 && (
            <>
              <div className="border-t border-gf-border" />
              <div className="space-y-2.5 px-5 py-5">
                <div className="flex items-center gap-2.5">
                  <h4 className="text-[13px] font-semibold text-gf-text">
                    Alertas del estado de cuenta
                  </h4>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      visibleHasCritical
                        ? "bg-red-50 text-red-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {visibleAlerts.length}{" "}
                    {visibleHasCritical ? "críticas" : "advertencias"}
                  </span>
                </div>
                <div className="space-y-2">
                  {visibleAlerts.map((alert) => {
                      const isCrit = alert.severity === "CRITICAL";
                      return (
                        <div
                          key={alert.code}
                          className={`flex items-start gap-3 rounded-lg px-4 py-3 ${
                            isCrit ? "bg-red-50" : "bg-amber-50"
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                              isCrit ? "bg-red-500" : "bg-amber-500"
                            }`}
                          >
                            !
                          </span>
                          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                            <span
                              className={`text-[13px] font-semibold ${
                                isCrit ? "text-red-800" : "text-amber-800"
                              }`}
                            >
                              {alert.message}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function MetricCell({
  label,
  value,
  sub,
  danger,
  warning,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  danger?: boolean;
  warning?: boolean;
  accent?: boolean;
}) {
  const valueColor = danger
    ? "text-red-600"
    : warning
      ? "text-amber-600"
      : accent
        ? "text-green-600"
        : "text-gf-text";
  const subColor = danger
    ? "text-red-500"
    : warning
      ? "text-amber-500"
      : accent
        ? "text-green-600"
        : "text-gf-text-muted";

  return (
    <div className="flex flex-col items-center gap-1 px-3">
      <span className="text-[11px] font-medium text-gf-text-soft text-center">
        {label}
      </span>
      <span className={`text-xl font-bold ${valueColor}`}>{value}</span>
      <span className={`text-[10px] ${subColor}`}>{sub}</span>
    </div>
  );
}

function FieldCell({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-gf-text-soft">{label}</span>
      <span
        className={`text-[13px] font-semibold text-gf-text ${
          mono ? "font-mono tracking-tight" : ""
        }`}
      >
        {children}
      </span>
    </div>
  );
}

/** Parse ISO date into { monthAbbr, day, year } for the visual date block. */
function parseDateParts(
  iso: string,
): { monthAbbr: string; day: string; year: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const months: Record<string, string> = {
    "01": "ENE", "02": "FEB", "03": "MAR", "04": "ABR",
    "05": "MAY", "06": "JUN", "07": "JUL", "08": "AGO",
    "09": "SEP", "10": "OCT", "11": "NOV", "12": "DIC",
  };
  return { monthAbbr: months[m[2]] ?? m[2], day: m[3], year: m[1] };
}

function fmtShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]} ${fmtMonthAbbr(m[2])} ${m[1]}`;
  return iso;
}

function fmtMonthAbbr(mm: string): string {
  const months: Record<string, string> = {
    "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
  };
  return months[mm] ?? mm;
}

function fmtMonthYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months: Record<string, string> = {
    "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
    "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
    "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
  };
  return `${months[m[2]] ?? m[2]} ${m[1]}`;
}

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount);
}

function maskClabe(clabe: string): string {
  if (clabe.length <= 8) return clabe;
  return clabe.slice(0, 4) + " **** " + clabe.slice(-4);
}
